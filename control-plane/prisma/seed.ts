import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  // Create global admin
  const hashedPassword = await argon2.hash('admin123!');
  
  const globalAdmin = await prisma.globalAdmin.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      password: hashedPassword,
      name: 'System Administrator',
      active: true,
    },
  });

  console.log('Created global admin:', globalAdmin);

  // Create demo tenant
  const tenant = await prisma.tenant.upsert({
    where: { domain: 'demo.tenant.com' },
    update: {},
    create: {
      name: 'Demo Tenant',
      domain: 'demo.tenant.com',
      active: true,
      description: 'Demo tenant for testing',
      maxNodes: 10,
      maxServers: 50,
      maxUsers: 100,
      storageGb: 500,
      memoryMb: 8192,
      cpuCores: 4,
    },
  });

  console.log('Created demo tenant:', tenant);

  // Create tenant admin
  const tenantAdminPassword = await argon2.hash('tenant123!');
  
  const tenantAdmin = await prisma.tenantAdmin.upsert({
    where: { email: 'admin@demo.tenant.com' },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'admin@demo.tenant.com',
      password: tenantAdminPassword,
      name: 'Tenant Administrator',
      active: true,
      role: 'admin',
    },
  });

  console.log('Created tenant admin:', tenantAdmin);

  // Add some demo eggs
  const minecraftEgg = await prisma.egg.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      name: 'Minecraft Java',
      description: 'Minecraft Java Edition server',
      dockerImage: 'quay.io/pterodactyl/core:java',
      startup: 'java -Xms128M -XX:MaxRAMPercentage=95.0 -Dterminal.jline=false -Dterminal.ansi=true -jar {{SERVER_JARFILE}}',
      category: 'minecraft',
      configFiles: {
        'server.properties': {
          parser: 'properties',
          find: {
            'server-port': '{{server.build.default.port}}',
            'query.port': '{{server.build.default.port}}',
          },
        },
      },
      configLogs: {
        custom: false,
        location: 'logs/latest.log',
      },
      configStop: 'stop',
      variables: [
        {
          name: 'Server Jar File',
          description: 'The name of the server jarfile to run the server with.',
          env_variable: 'SERVER_JARFILE',
          default_value: 'server.jar',
          user_viewable: true,
          user_editable: true,
          rules: 'required|regex:/^([\\w\\d._-]+)(\\.jar)$/',
        },
      ],
    },
  });

  // Enable egg for demo tenant
  await prisma.tenantEgg.upsert({
    where: {
      tenantId_eggId: {
        tenantId: tenant.id,
        eggId: minecraftEgg.id,
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      eggId: minecraftEgg.id,
      enabled: true,
    },
  });

  console.log('Seeding completed successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });