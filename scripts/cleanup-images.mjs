import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff'];

async function findImages(dir) {
  const images = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      const subImages = await findImages(fullPath);
      images.push(...subImages);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (IMAGE_EXTENSIONS.includes(ext)) {
        images.push(fullPath);
      }
    }
  }
  
  return images;
}

async function cleanupConvertedImages(imagePath) {
  const dir = path.dirname(imagePath);
  const ext = path.extname(imagePath);
  const basename = path.basename(imagePath, ext);
  const webpPath = path.join(dir, `${basename}.webp`);
  
  try {
    // Check if WebP version exists
    await fs.access(webpPath);
    
    // If we're here, the WebP exists. Get stats for reporting before deleting.
    const stats = await fs.stat(imagePath);
    
    // Delete the original file
    await fs.unlink(imagePath);
    
    console.log(`🗑️ Deleted: ${path.relative(PUBLIC_DIR, imagePath)}`);
    return stats.size;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // WebP doesn't exist, skip deleting the original
      // console.log(`Skipping (no WebP): ${path.relative(PUBLIC_DIR, imagePath)}`);
    } else {
      console.error(`❌ Error processing ${imagePath}: ${error.message}`);
    }
    return 0;
  }
}

async function main() {
  console.log('🔍 Searching for original images to cleanup...\n');
  
  const images = await findImages(PUBLIC_DIR);
  let deletedCount = 0;
  let reclaimedBytes = 0;
  
  console.log('─'.repeat(50));
  
  for (const imagePath of images) {
    const size = await cleanupConvertedImages(imagePath);
    if (size > 0) {
      deletedCount++;
      reclaimedBytes += size;
    }
  }
  
  console.log('\n' + '─'.repeat(50));
  console.log('\n📊 Cleanup Summary:');
  console.log(`   Deleted Files: ${deletedCount}`);
  console.log(`   Reclaimed Space: ${(reclaimedBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log('\n✨ Cleanup complete!');
}

main().catch(console.error);
