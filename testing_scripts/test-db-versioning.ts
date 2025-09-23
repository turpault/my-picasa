#!/usr/bin/env ts-node

import { join } from "path";
import { imagesRoot } from "../server/utils/constants";

// Import the functions we need to test
async function testDatabaseVersioning() {
  // Dynamic import to avoid module resolution issues
  const { getDatabaseVersion, getRequiredDatabaseVersion, getIndexingService } = await import("../worker/background/bg-indexing");
  console.log("🧪 Testing Database Versioning System");
  console.log("=====================================");
  
  try {
    // Test getting the required version
    const requiredVersion = getRequiredDatabaseVersion();
    console.log(`📋 Required database version: ${requiredVersion}`);
    
    // Test getting the current version (this will initialize the database if needed)
    const currentVersion = getDatabaseVersion();
    console.log(`📊 Current database version: ${currentVersion}`);
    
    // Verify versions match
    if (currentVersion === requiredVersion) {
      console.log("✅ Database version is up to date!");
    } else {
      console.log("⚠️  Database version mismatch detected");
    }
    
    // Test the service directly
    const service = getIndexingService();
    const serviceVersion = service.getDatabaseVersion();
    console.log(`🔧 Service database version: ${serviceVersion}`);
    
    // Get some basic stats
    const stats = service.getStats();
    console.log(`📈 Database stats: ${stats.totalPictures} pictures, ${stats.totalFolders} folders`);
    
    console.log("\n🎉 Database versioning test completed successfully!");
    
  } catch (error) {
    console.error("❌ Error testing database versioning:", error);
    process.exit(1);
  }
}

// Run the test
testDatabaseVersioning().catch(console.error);
