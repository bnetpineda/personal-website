import sharp from 'sharp';
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

async function convertToWebp(imagePath) {
  const dir = path.dirname(imagePath);
  const basename = path.basename(imagePath, path.extname(imagePath));
  const webpPath = path.join(dir, `${basename}.webp`);
  
  try {
    const inputBuffer = await fs.readFile(imagePath);
    const originalSize = inputBuffer.length;
    
    const webpBuffer = await sharp(inputBuffer)
      .webp({ quality: 80 })
      .toBuffer();
    
    await fs.writeFile(webpPath, webpBuffer);
    
    const savings = ((originalSize - webpBuffer.length) / originalSize * 100).toFixed(1);
    const originalKB = (originalSize / 1024).toFixed(1);
    const webpKB = (webpBuffer.length / 1024).toFixed(1);
    
    console.log(`✅ ${path.relative(PUBLIC_DIR, imagePath)}`);
    console.log(`   ${originalKB}KB → ${webpKB}KB (${savings}% smaller)`);
    
    return {
      original: imagePath,
      webp: webpPath,
      originalSize,
      webpSize: webpBuffer.length,
      savings: parseFloat(savings)
    };
  } catch (error) {
    console.error(`❌ Failed to convert ${imagePath}: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('🔍 Finding images in public directory...\n');
  
  const images = await findImages(PUBLIC_DIR);
  console.log(`Found ${images.length} images to convert\n`);
  console.log('─'.repeat(50));
  
  const results = [];
  
  for (const imagePath of images) {
    const result = await convertToWebp(imagePath);
    if (result) results.push(result);
  }
  
  console.log('\n' + '─'.repeat(50));
  console.log('\n📊 Summary:');
  console.log(`   Converted: ${results.length}/${images.length} images`);
  
  const totalOriginal = results.reduce((sum, r) => sum + r.originalSize, 0);
  const totalWebp = results.reduce((sum, r) => sum + r.webpSize, 0);
  const totalSavings = ((totalOriginal - totalWebp) / totalOriginal * 100).toFixed(1);
  
  console.log(`   Original total: ${(totalOriginal / 1024 / 1024).toFixed(2)}MB`);
  console.log(`   WebP total: ${(totalWebp / 1024 / 1024).toFixed(2)}MB`);
  console.log(`   Total savings: ${totalSavings}%`);
  console.log('\n✨ Conversion complete! Original files kept as backup.');
}

main().catch(console.error);
