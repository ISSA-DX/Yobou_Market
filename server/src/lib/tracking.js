/**
 * Courier GPS tracking — one source of truth, four audiences.
 *
 * The courier app posts GPS fixes (POST /api/driver/location). Each fix
 * updates DriverLocation, appends a DeliveryPing breadcrumb to the
 * courier's active jobs, and pushes a live `event: courier` SSE frame to
 * whoever is allowed to see it:
 *
 *   audience   sees the courier's position…           and also
 *   ---------  ------------------------------------   ------------------------------
 *   admin      always while on duty (fleet map)       full route replay, drop-off GPS
 *   vendor     only while heading to them (ASSIGNED)  pickup / delivery timestamps
 *   customer   only while out for delivery            route since pickup, call button
 *   courier    own position                            own jobs
 *
 * After pickup the vendor no longer sees the courier (the customer's
 * address is private), and the customer never sees the courier before
 * pickup (the courier may be serving other stops).
 */
const { prisma } = require('../prisma');
const { pushEvent } = require('./notifications');

const STALE_MS = 2 * 60 * 1000; // a fix older than this is shown as "signal lost"
const PING_EVERY_MS = 10 * 1000; // breadcrumb sampling interval per delivery
const ACTIVE = ['ASSIGNED', 'PICKED_UP'];

function fixOf(loc) {
  if (!loc || loc.lat == null || loc.lng == null) return null;
  return {
    lat: loc.lat,
    lng: loc.lng,
    accuracy: loc.accuracy ?? null,
    heading: loc.heading ?? null,
    speed: loc.speed ?? null,
    at: loc.updatedAt,
    stale: Date.now() - new Date(loc.updatedAt).getTime() > STALE_MS,
  };
}

async function recordLocation(driver, { lat, lng, accuracy, heading, speed }) {
  const loc = await prisma.driverLocation.upsert({
    where: { driverId: driver.id },
    create: { driverId: driver.id, onDuty: true, lat, lng, accuracy, heading, speed },
    update: { onDuty: true, lat, lng, accuracy, heading, speed },
  });

  const jobs = await prisma.delivery.findMany({
    where: { driverId: driver.id, status: { in: ACTIVE } },
    select: {
      id: true,
      status: true,
      orderId: true,
      pings: { orderBy: { at: 'desc' }, take: 1, select: { at: true } },
      order: {
        select: {
          userId: true,
          status: true,
          items: { select: { product: { select: { vendor: { select: { userId: true } } } } } },
        },
      },
    },
  });

  const fix = fixOf(loc);
  for (const job of jobs) {
    if (['CANCELLED', 'REFUNDED'].includes(job.order.status)) continue;
    const last = job.pings[0]?.at;
    if (!last || Date.now() - new Date(last).getTime() >= PING_EVERY_MS) {
      await prisma.deliveryPing.create({ data: { deliveryId: job.id, lat, lng } });
    }
    const frame = { orderId: job.orderId, deliveryId: job.id, status: job.status, location: fix };
    if (job.status === 'PICKED_UP') {
      pushEvent(job.order.userId, 'courier', { ...frame, audience: 'customer' });
    } else {
      const vendorUserIds = new Set(job.order.items.map((i) => i.product?.vendor?.userId).filter(Boolean));
      for (const uid of vendorUserIds) pushEvent(uid, 'courier', { ...frame, audience: 'vendor' });
    }
  }

  // Fleet map: every connected admin.
  pushEvent(null, 'courier', {
    audience: 'admin',
    driverId: driver.id,
    name: driver.name,
    onDuty: true,
    location: fix,
    activeDeliveries: jobs.map((j) => ({ id: j.id, orderId: j.orderId, status: j.status })),
  });
  return { location: fix, activeDeliveries: jobs.length };
}

async function setDuty(driver, onDuty) {
  const loc = await prisma.driverLocation.upsert({
    where: { driverId: driver.id },
    create: { driverId: driver.id, onDuty },
    update: { onDuty },
  });
  pushEvent(null, 'courier', { audience: 'admin', driverId: driver.id, name: driver.name, onDuty, location: onDuty ? fixOf(loc) : null });
  return { onDuty: loc.onDuty, location: fixOf(loc) };
}

/**
 * Tracking view of one order for a given audience. Returns null when the
 * order has no courier delivery.
 */
async function trackingFor(orderId, audience) {
  const d = await prisma.delivery.findUnique({
    where: { orderId },
    include: { driver: { select: { id: true, name: true, phone: true, driverLocation: true } } },
  });
  if (!d) return null;

  const loc = d.driver?.driverLocation;
  const live = loc?.onDuty ? fixOf(loc) : null;
  let location = null;
  if (audience === 'admin' && ACTIVE.includes(d.status)) location = live;
  if (audience === 'vendor' && d.status === 'ASSIGNED') location = live;
  if (audience === 'customer' && d.status === 'PICKED_UP') location = live;

  let route = [];
  if (audience === 'admin' || (audience === 'customer' && d.pickedUpAt)) {
    const pings = await prisma.deliveryPing.findMany({
      where: {
        deliveryId: d.id,
        ...(audience === 'customer' ? { at: { gte: d.pickedUpAt } } : {}),
      },
      orderBy: { at: 'asc' },
      take: 2000,
      select: { lat: true, lng: true, at: true },
    });
    route = pings.map((p) => [p.lat, p.lng]);
  }

  return {
    audience,
    status: d.status,
    assignedAt: d.assignedAt,
    pickedUpAt: d.pickedUpAt,
    deliveredAt: d.deliveredAt,
    attempts: d.attempts,
    failReason: d.failReason,
    courier: d.driver ? { name: d.driver.name, phone: d.driver.phone } : null,
    location,
    route,
    // Proof-of-delivery position is for admins and the customer only.
    dropoff: audience !== 'vendor' && d.deliveredLat != null ? { lat: d.deliveredLat, lng: d.deliveredLng } : null,
    // The hand-over code: the customer shows it to the courier; admins can
    // read it to support a customer on the phone. Never sent to vendors.
    deliveryCode: audience !== 'vendor' && ACTIVE.includes(d.status) ? d.deliveryCode : null,
    rating: audience !== 'vendor' && d.rating ? { stars: d.rating, comment: d.ratingComment, at: d.ratedAt } : null,
    canRate: audience === 'customer' && d.status === 'DELIVERED' && !d.rating,
  };
}

/** Admin fleet map: every courier with their duty state, last fix and jobs. */
async function fleet() {
  const drivers = await prisma.user.findMany({
    where: { role: 'DRIVER', disabledAt: null },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      phone: true,
      driverLocation: true,
      deliveries: {
        where: { status: { in: ACTIVE } },
        select: {
          id: true,
          status: true,
          orderId: true,
          order: { select: { snapshotName: true, snapshotLine1: true, snapshotCity: true, paymentMethod: true, totalCents: true } },
        },
      },
    },
  });
  return drivers.map((d) => ({
    driverId: d.id,
    name: d.name,
    phone: d.phone,
    onDuty: Boolean(d.driverLocation?.onDuty),
    location: d.driverLocation?.onDuty ? fixOf(d.driverLocation) : null,
    activeDeliveries: d.deliveries,
  }));
}

module.exports = { recordLocation, setDuty, trackingFor, fleet, STALE_MS };
