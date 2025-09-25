#!/usr/bin/env ts-node

/**
 * Test script for mark-and-sweep functionality in PictureIndexingService
 * 
 * This script tests the mark-and-sweep feature by:
 * 1. Creating some test records in the database
 * 2. Running the mark-and-sweep process
 * 3. Verifying that orphaned records are removed
 */

import { getIndexingService } from "../worker/background/bg-indexing";
import { Album, AlbumKind } from "../shared/types/types";

const debugLogger = console.log;

async function testMarkAndSweep() {
  debugLogger("🧪 Starting mark-and-sweep test...");

  try {
    const service = getIndexingService();
    
    // Get the database instance to perform direct operations
    const db = (service as any).db;
    
    // Create some test records
    debugLogger("📝 Creating test records...");
    
    const testRecords = [
      {
        album_key: "test-album-1",
        album_name: "Test Album 1",
        entry_name: "test-image-1.jpg",
        persons: "John Doe",
        star_count: "3",
        geo_poi: "Paris, France",
        photostar: 1,
        text_content: "Test image 1",
        caption: "Beautiful sunset",
        entry_type: "picture",
        marked: 0 // This will be orphaned
      },
      {
        album_key: "test-album-2", 
        album_name: "Test Album 2",
        entry_name: "test-image-2.jpg",
        persons: "Jane Smith",
        star_count: "5",
        geo_poi: "New York, USA",
        photostar: 0,
        text_content: "Test image 2",
        caption: "City skyline",
        entry_type: "picture",
        marked: 0 // This will be orphaned
      }
    ];

    // Insert test records
    const insertStmt = db.prepare(`
      INSERT INTO pictures (
        album_key, album_name, entry_name, persons, star_count, geo_poi, 
        photostar, text_content, caption, entry_type, marked
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const record of testRecords) {
      insertStmt.run(
        record.album_key, record.album_name, record.entry_name,
        record.persons, record.star_count, record.geo_poi,
        record.photostar, record.text_content, record.caption,
        record.entry_type, record.marked
      );
    }

    debugLogger(`✅ Created ${testRecords.length} test records`);

    // Count records before mark-and-sweep
    const countBeforeStmt = db.prepare("SELECT COUNT(*) as count FROM pictures");
    const countBefore = countBeforeStmt.get() as { count: number };
    debugLogger(`📊 Records before mark-and-sweep: ${countBefore.count}`);

    // Count unmarked records
    const unmarkedBeforeStmt = db.prepare("SELECT COUNT(*) as count FROM pictures WHERE marked = 0");
    const unmarkedBefore = unmarkedBeforeStmt.get() as { count: number };
    debugLogger(`📊 Unmarked records before sweep: ${unmarkedBefore.count}`);

    // Run the mark-and-sweep process
    debugLogger("🔄 Running mark-and-sweep process...");
    await service.indexAllPictures();

    // Count records after mark-and-sweep
    const countAfterStmt = db.prepare("SELECT COUNT(*) as count FROM pictures");
    const countAfter = countAfterStmt.get() as { count: number };
    debugLogger(`📊 Records after mark-and-sweep: ${countAfter.count}`);

    // Count unmarked records (should be 0)
    const unmarkedAfterStmt = db.prepare("SELECT COUNT(*) as count FROM pictures WHERE marked = 0");
    const unmarkedAfter = unmarkedAfterStmt.get() as { count: number };
    debugLogger(`📊 Unmarked records after sweep: ${unmarkedAfter.count}`);

    // Verify results
    const removedCount = countBefore.count - countAfter.count;
    debugLogger(`🗑️  Records removed: ${removedCount}`);
    
    if (unmarkedAfter.count === 0) {
      debugLogger("✅ SUCCESS: All unmarked records were properly removed!");
    } else {
      debugLogger(`❌ FAILURE: ${unmarkedAfter.count} unmarked records still exist`);
    }

    if (removedCount >= testRecords.length) {
      debugLogger("✅ SUCCESS: Test records were properly removed!");
    } else {
      debugLogger(`❌ FAILURE: Expected at least ${testRecords.length} records to be removed, but only ${removedCount} were removed`);
    }

    // Clean up any remaining test records
    debugLogger("🧹 Cleaning up test records...");
    const deleteTestStmt = db.prepare("DELETE FROM pictures WHERE album_key LIKE 'test-album-%'");
    const deleteResult = deleteTestStmt.run();
    debugLogger(`🧹 Cleaned up ${deleteResult.changes} test records`);

    debugLogger("🎉 Mark-and-sweep test completed!");

  } catch (error) {
    debugLogger("❌ Test failed with error:", error);
    process.exit(1);
  }
}

// Run the test
testMarkAndSweep().catch(console.error);
