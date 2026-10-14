// Adds the demo courier (driver@yobou.test / Driver123!) to an existing
// database without wiping it — unlike `npm run seed`. Idempotent.
// Run from server/: node scripts/add-demo-courier.js
require('dotenv').config();
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

(async () => {
  const email = 'driver@yobou.test';
  const users = await prisma.user.count();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Courier already exists (${existing.role}). Users in DB: ${users}`);
  } else {
    await prisma.user.create({
      data: {
        email,
        name: 'Demo Courier',
        role: 'DRIVER',
        phone: '+1-555-0199',
        passwordHash: await bcrypt.hash('Driver123!', 12),
      },
    });
    console.log(`Created courier ${email} / Driver123!. Users in DB: ${users + 1}`);
  }
  const admin = await prisma.user.findUnique({ where: { email: 'admin@yobou.test' } });
  console.log(admin ? 'Demo admin present.' : 'Demo admin MISSING — run `npm run seed` for demo data.');
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
