// Singleton PrismaClient — avoids exhausting connections in dev with hot reload.
const { PrismaClient } = require('@prisma/client');

const prisma = global.__prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') global.__prisma = prisma;
if (!prisma.__instanceId) prisma.__instanceId = Math.random().toString(36).slice(2,8);

module.exports = { prisma };