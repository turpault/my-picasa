#!/usr/bin/env ts-node

/**
 * Test script for the picture indexing service
 * This script demonstrates how to use the indexing functionality
 */

import { 
  getIndexingService, 
  queryFoldersByStrings, 
  getAllFolders, 
  getIndexingStats,
  queryAlbumEntries
} from "../worker/background/bg-indexing";

async function testIndexingService() {
  console.log("🧪 Testing Picture Indexing Service");
  console.log("=====================================");

  try {
    // Get the indexing service
    const service = getIndexingService();
    
    // Get current statistics
    console.log("\n📊 Current Index Statistics:");
    const stats = getIndexingStats();
    console.log(`- Total Pictures: ${stats.totalPictures}`);
    console.log(`- Total Folders: ${stats.totalFolders}`);
    console.log(`- Last Updated: ${stats.lastUpdated}`);

    // Get all folders
    console.log("\n📁 All Folders in Index:");
    const allFolders = getAllFolders();
    console.log(`Found ${allFolders.length} folders:`);
    allFolders.slice(0, 10).forEach((folder, index) => {
      console.log(`  ${index + 1}. ${folder.folder_name} (${folder.match_count} pictures)`);
    });
    if (allFolders.length > 10) {
      console.log(`  ... and ${allFolders.length - 10} more folders`);
    }

    // Test folder querying with sample search terms
    console.log("\n🔍 Testing Folder Queries:");
    
    const searchTerms = ["2023", "vacation", "family", "birthday", "wedding"];
    
    for (const term of searchTerms) {
      console.log(`\nSearching for folders containing: "${term}"`);
      const results = queryFoldersByStrings([term]);
      
      if (results.length > 0) {
        console.log(`  Found ${results.length} matching folders:`);
        results.slice(0, 5).forEach((folder, index) => {
          console.log(`    ${index + 1}. ${folder.folder_name} (${folder.match_count} matches)`);
        });
        if (results.length > 5) {
          console.log(`    ... and ${results.length - 5} more folders`);
        }
      } else {
        console.log(`  No folders found containing "${term}"`);
      }
    }

    // Test multiple search terms
    console.log("\n🔍 Testing Multiple Search Terms:");
    const multiTermResults = queryFoldersByStrings(["2023", "family"]);
    console.log(`Folders matching both "2023" AND "family": ${multiTermResults.length}`);
    multiTermResults.slice(0, 5).forEach((folder, index) => {
      console.log(`  ${index + 1}. ${folder.folder_name} (${folder.match_count} matches)`);
    });

    // Test album entry querying
    console.log("\n📸 Testing Album Entry Querying:");
    if (allFolders.length > 0) {
      const testAlbum = allFolders[0];
      console.log(`\nSearching for entries in album: "${testAlbum.folder_name}"`);
      
      const albumEntryResults = queryAlbumEntries(testAlbum.folder_path, ["2023", "photo"]);
      console.log(`Found ${albumEntryResults.length} matching entries:`);
      
      albumEntryResults.slice(0, 10).forEach((entry, index) => {
        console.log(`  ${index + 1}. ${entry.name}`);
      });
      
      if (albumEntryResults.length > 10) {
        console.log(`  ... and ${albumEntryResults.length - 10} more entries`);
      }

      // Test with different search terms
      const differentSearchTerms = ["jpg", "jpeg", "png"];
      console.log(`\nSearching for entries with file extensions: ${differentSearchTerms.join(", ")}`);
      const extensionResults = queryAlbumEntries(testAlbum.folder_path, differentSearchTerms);
      console.log(`Found ${extensionResults.length} entries with those extensions`);
    } else {
      console.log("No folders available for album entry testing");
    }

    console.log("\n✅ Indexing service test completed successfully!");
    
  } catch (error) {
    console.error("❌ Error testing indexing service:", error);
    process.exit(1);
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testIndexingService().then(() => {
    console.log("\n🎉 All tests completed!");
    process.exit(0);
  }).catch((error) => {
    console.error("💥 Test failed:", error);
    process.exit(1);
  });
}

export { testIndexingService };
