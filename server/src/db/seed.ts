import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";
import { hashPassword } from "../lib/auth";

const db = drizzle(new Database(process.env.DB_FILE_NAME || "prediction_market.db"), {
  schema,
});

const USERS = [
  { username: "alice", email: "alice@example.com", password: "password123" },
  { username: "bob", email: "bob@example.com", password: "password456" },
  { username: "charlie", email: "charlie@example.com", password: "password789" },
];

const ADMIN_USER = {
  username: "admin",
  email: "admin@example.com",
  password: "admin123",
  role: "admin" as const,
};

const MARKETS = [
  {
    title: "Will Bitcoin reach $100k by end of 2024?",
    description: "Bitcoin price prediction for the end of the year",
    outcomes: ["Yes", "No"],
  },
  {
    title: "Will it rain tomorrow in NYC?",
    description: "Weather prediction for New York City",
    outcomes: ["Yes", "No", "Maybe"],
  },
  {
    title: "Who will win the 2024 US Presidential Election?",
    description: "Political prediction market",
    outcomes: ["Candidate A", "Candidate B", "Other"],
  },
];

async function deleteAllData() {
  console.log("🗑️  Deleting all data...");

  // Delete in order (respecting foreign keys)
  await db.delete(schema.betsTable);
  console.log("  ✓ Deleted bets");

  await db.delete(schema.marketOutcomesTable);
  console.log("  ✓ Deleted market outcomes");

  await db.delete(schema.marketsTable);
  console.log("  ✓ Deleted markets");

  await db.delete(schema.usersTable);
  console.log("  ✓ Deleted users");

  console.log("✅ All data deleted\n");
}

async function seedDatabase() {
  console.log("🌱 Seeding database...\n");

  const createdUsers: Array<{
    id: number;
    username: string;
    email: string;
    password: string;
  }> = [];

  // 1. Create users
  console.log("👤 Creating users...");
  for (const user of USERS) {
    const passwordHash = await hashPassword(user.password);
    const created = await db
      .insert(schema.usersTable)
      .values({
        username: user.username,
        email: user.email,
        passwordHash,
      })
      .returning();

    createdUsers.push({
      id: created[0].id,
      username: user.username,
      email: user.email,
      password: user.password,
    });
    console.log(`  ✓ Created user: ${user.username} (${user.email})`);
  }

  // Create admin user
  const adminPasswordHash = await hashPassword(ADMIN_USER.password);
  const adminCreated = await db
    .insert(schema.usersTable)
    .values({
      username: ADMIN_USER.username,
      email: ADMIN_USER.email,
      passwordHash: adminPasswordHash,
      role: "admin",
    })
    .returning();

  createdUsers.push({
    id: adminCreated[0].id,
    username: ADMIN_USER.username,
    email: ADMIN_USER.email,
    password: ADMIN_USER.password,
  });
  console.log(`  ✓ Created admin user: ${ADMIN_USER.username} (${ADMIN_USER.email})`);

  // 2. Create markets and outcomes
  console.log("\n📊 Creating markets...");
  let marketCount = 0;
  let outcomeCount = 0;

  for (let i = 0; i < MARKETS.length; i++) {
    const marketData = MARKETS[i];
    const createdBy = createdUsers[i % createdUsers.length].id;

    const market = await db
      .insert(schema.marketsTable)
      .values({
        title: marketData.title,
        description: marketData.description,
        createdBy,
      })
      .returning();

    marketCount++;
    console.log(`  ✓ Created market: "${marketData.title}"`);

    // Create outcomes for this market
    for (let j = 0; j < marketData.outcomes.length; j++) {
      await db.insert(schema.marketOutcomesTable).values({
        marketId: market[0].id,
        title: marketData.outcomes[j],
        position: j,
      });
      outcomeCount++;
    }
    console.log(`    └─ ${marketData.outcomes.length} outcomes created`);
  }

  // 3. Place some test bets
  console.log("\n💰 Creating sample bets...");
  let betCount = 0;

  // Get all markets and outcomes
  const markets = await db.query.marketsTable.findMany({
    with: { outcomes: true },
  });

  for (const market of markets) {
    for (const user of createdUsers) {
      // Each user bets on the first outcome of every market
      const outcome = market.outcomes[0];
      const betAmount = 50;

      await db.insert(schema.betsTable).values({
        userId: user.id,
        marketId: market.id,
        outcomeId: outcome.id,
        amount: betAmount,
      });

      betCount++;
    }

    console.log(`  ✓ Created ${createdUsers.length} bets on "${market.title}"`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ SEEDING COMPLETE!");
  console.log("=".repeat(60));
  console.log(`\nCreated:`);
  console.log(`  • ${createdUsers.length} users`);
  console.log(`  • ${marketCount} markets`);
  console.log(`  • ${outcomeCount} outcomes`);
  console.log(`  • ${betCount} bets`);

  console.log("\n" + "=".repeat(60));
  console.log("🔑 TEST CREDENTIALS (for login):");
  console.log("=".repeat(60));

  for (const user of createdUsers) {
    console.log(`\n  Username: ${user.username}`);
    console.log(`  Email:    ${user.email}`);
    console.log(`  Password: ${user.password}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log(
    "\n✨ Database is ready! Start the app and login with any of the above credentials.\n",
  );
}

async function main() {
  const command = process.argv[2];

  if (command === "reset") {
    await deleteAllData();
    await seedDatabase();
  } else if (command === "seed") {
    await seedDatabase();
  } else if (command === "delete") {
    await deleteAllData();
  } else {
    console.log("Usage:");
    console.log("  bun run db:seed        # Seed with test data");
    console.log("  bun run db:reset       # Delete all and reseed");
    console.log("  bun run db:delete      # Delete all data");
  }
}

main().catch(console.error);
