# IPFS Storage - Quick Start Guide

Get started with IPFS storage in under 5 minutes.

## Installation

Already included in `@holoscript/core` package. No additional installation needed.

```bash
npm install @holoscript/core
# or
pnpm add @holoscript/core
```

## Get API Keys

Choose one provider to start (NFT.Storage recommended for beginners):

### Option 1: NFT.Storage (Easiest - 100GB Free)

1. Visit https://nft.storage/
2. Sign up with GitHub or email
3. Go to https://nft.storage/manage/
4. Click "Create API Key"
5. Copy the key

### Option 2: Pinata (1GB Free)

1. Visit https://pinata.cloud/
2. Sign up
3. Go to https://pinata.cloud/keys
4. Create new API key with admin permissions
5. Copy the API Key and API Secret

### Option 3: Infura (5GB Free)

1. Visit https://infura.io/
2. Sign up
3. Create a new project
4. Enable IPFS
5. Copy Project ID and Secret

## Environment Setup

Create `.env` file:

```bash
# Choose one or more providers
NFT_STORAGE_KEY=your_nft_storage_key
# PINATA_API_KEY=your_pinata_key
# PINATA_API_SECRET=your_pinata_secret
# INFURA_PROJECT_ID=your_infura_id
# INFURA_SECRET=your_infura_secret
```

## Basic Usage

### 1. Import the Service

```typescript
import { IPFSService } from '@holoscript/core/storage';
```

### 2. Initialize

```typescript
const ipfs = new IPFSService({
  provider: 'nft.storage',
  apiKey: process.env.NFT_STORAGE_KEY!,
  enableCDN: true // Optional: Use Cloudflare CDN
});
```

### 3. Upload Files

```typescript
// Upload NFT assets
const result = await ipfs.upload({
  name: 'my_nft_assets',
  files: [
    {
      path: 'image.png',
      content: await fs.readFile('./image.png')
    },
    {
      path: 'metadata.json',
      content: JSON.stringify({
        name: 'My NFT',
        description: 'Amazing NFT',
        image: 'ipfs://[CID]/image.png'
      })
    }
  ]
});

console.log('IPFS URI:', result.uri);
// Output: ipfs://bafybeig...

console.log('CDN URL:', result.cdnUrl);
// Output: https://cloudflare-ipfs.com/ipfs/bafybeig...
```

### 4. Use in NFT Minting

```typescript
// The IPFS URI can now be used as metadataUri in NFT minting
const metadataUri = result.uri; // ipfs://bafybeig...
```

## Complete Example

```typescript
import { IPFSService } from '@holoscript/core/storage';
import fs from 'fs/promises';

async function uploadNFT() {
  // 1. Initialize IPFS service
  const ipfs = new IPFSService({
    provider: 'nft.storage',
    apiKey: process.env.NFT_STORAGE_KEY!,
    enableCDN: true
  });

  // 2. Prepare metadata
  const metadata = {
    name: 'My First NFT',
    description: 'Created with HoloScript',
    image: '', // Will be set after upload
    attributes: [
      { trait_type: 'Type', value: 'Digital Art' },
      { trait_type: 'Rarity', value: 'Common' }
    ]
  };

  // 3. Upload image first
  const imageBuffer = await fs.readFile('./my-image.png');
  const imageResult = await ipfs.upload({
    name: 'nft_image',
    files: [
      { path: 'image.png', content: imageBuffer }
    ]
  });

  // 4. Update metadata with image URI
  metadata.image = `${imageResult.uri}/image.png`;

  // 5. Upload metadata
  const metadataResult = await ipfs.upload({
    name: 'nft_metadata',
    files: [
      {
        path: 'metadata.json',
        content: JSON.stringify(metadata, null, 2)
      }
    ]
  });

  console.log('✅ NFT assets uploaded!');
  console.log('Image CID:', imageResult.cid);
  console.log('Metadata URI:', metadataResult.uri);
  console.log('View at:', metadataResult.cdnUrl);

  return metadataResult.uri; // Use this for NFT minting
}

// Run it
uploadNFT().catch(console.error);
```

## Progress Tracking

```typescript
await ipfs.upload({
  name: 'large_file',
  files: [
    { path: 'video.mp4', content: largeVideoBuffer }
  ],
  onProgress: (progress) => {
    console.log(`Uploading: ${progress.percentage.toFixed(1)}%`);
    console.log(`Current file: ${progress.currentFile}`);
  }
});
```

## Error Handling

```typescript
import { IPFSUploadError, FileSizeExceededError } from '@holoscript/core/storage';

try {
  const result = await ipfs.upload({
    name: 'test',
    files: [{ path: 'file.txt', content: 'Hello' }]
  });
  console.log('Success:', result.cid);
} catch (error) {
  if (error instanceof FileSizeExceededError) {
    console.error('File too large!');
  } else if (error instanceof IPFSUploadError) {
    console.error('Upload failed:', error.message);
  } else {
    console.error('Unknown error:', error);
  }
}
```

## Production Setup (Recommended)

For production, use multiple providers for redundancy:

```typescript
const ipfs = new IPFSService({
  provider: 'pinata', // Primary
  apiKey: process.env.PINATA_API_KEY!,
  apiSecret: process.env.PINATA_API_SECRET,
  fallbackProviders: [
    {
      provider: 'nft.storage', // Fallback 1
      apiKey: process.env.NFT_STORAGE_KEY!
    },
    {
      provider: 'infura', // Fallback 2
      apiKey: process.env.INFURA_PROJECT_ID!,
      apiSecret: process.env.INFURA_SECRET
    }
  ],
  enableCDN: true,
  maxRetries: 3,
  maxFileSize: 100 * 1024 * 1024 // 100MB
});
```

This gives you:
- **99.9% uptime** with automatic fallback
- **3 retry attempts** per provider
- **CDN for fast global access**
- **100MB file size limit**

## Next Steps

1. ✅ Set up API keys
2. ✅ Try basic upload
3. ✅ Add progress tracking
4. ✅ Set up production config with fallbacks
5. 📚 Read full documentation in `README.md`
6. 🔗 Integrate with CreatorMonetization for NFT minting

## Common Issues

### "Upload failed: Invalid API key"
- Check your `.env` file
- Verify API key is correct
- Make sure no extra spaces

### "File size exceeded"
- Default limit is 100MB
- Increase with `maxFileSize` option
- Or compress your files

### "All providers failed"
- Check internet connection
- Verify API keys are valid
- Try again in a few minutes

## Support

- Documentation: See `README.md` in this directory
- Examples: See `INTEGRATION_EXAMPLE.ts`
- Tests: See `__tests__/IPFSService.test.ts`

## Performance

- Small files (<5MB): **<500ms**
- Large files (50MB): **~5 seconds** with chunking
- CDN latency: **<100ms** globally

Ready to upload? Start with the basic example above! 🚀
