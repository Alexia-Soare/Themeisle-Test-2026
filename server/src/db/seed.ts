import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq } from "drizzle-orm";
import * as schema from "./schema";
import { hashPassword } from "../lib/auth";

const db = drizzle(new Database(process.env.DB_FILE_NAME || "database.sqlite"), {
  schema,
});

const USERS = [
  { username: "alice", email: "alice@example.com", password: "password123" },
  { username: "bob", email: "bob@example.com", password: "password456" },
  { username: "charlie", email: "charlie@example.com", password: "password789" },
];

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

  for (let i = 0; i < markets.length; i++) {
    const market = markets[i];
    const user = createdUsers[i % createdUsers.length];

    // Place bets on different outcomes
    for (let j = 0; j < market.outcomes.length; j++) {
      const outcome = market.outcomes[j];
      const betAmount = 50 + j * 25; // 50, 75, 100, etc.

      await db.insert(schema.betsTable).values({
        userId: user.id,
        marketId: market.id,
        outcomeId: outcome.id,
        amount: betAmount,
      });

      betCount++;
    }

    console.log(
      `  ✓ Created ${market.outcomes.length} bets on "${market.title}"`
    );
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
  console.log("\n✨ Database is ready! Start the app and login with any of the above credentials.\n");
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
