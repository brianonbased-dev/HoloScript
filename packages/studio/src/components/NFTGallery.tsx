'use client';

import { useState } from 'react';
import { ExternalLink, DollarSign, TrendingUp } from 'lucide-react';
import type { NFTData } from '../hooks/useCreatorStats';

export interface NFTGalleryProps {
  nfts: NFTData[];
  loading?: boolean;
}

const ITEMS_PER_PAGE = 12;

export function NFTGallery({ nfts, loading }: NFTGalleryProps) {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(nfts.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentNFTs = nfts.slice(startIndex, endIndex);

  const handlePreviousPage = () => {
    setCurrentPage(prev => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage(prev => Math.min(totalPages, prev + 1));
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="h-6 bg-gray-700 rounded w-32 mb-6 animate-pulse"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-gray-700 rounded-lg animate-pulse">
              <div className="aspect-square bg-gray-600 rounded-t-lg"></div>
              <div className="p-4 space-y-3">
                <div className="h-4 bg-gray-600 rounded w-3/4"></div>
                <div className="h-3 bg-gray-600 rounded w-1/2"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const getStatusColor = (status: NFTData['status']) => {
    switch (status) {
      case 'sold':
        return 'bg-green-500/10 text-green-500';
      case 'listed':
        return 'bg-blue-500/10 text-blue-500';
      case 'minted':
        return 'bg-gray-500/10 text-gray-400';
      default:
        return 'bg-gray-500/10 text-gray-400';
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">NFT Collection</h2>
        <div className="text-gray-400 text-sm">
          {nfts.length} NFT{nfts.length !== 1 ? 's' : ''} minted
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
        {currentNFTs.map(nft => (
          <div
            key={nft.id}
            className="bg-gray-700 rounded-lg overflow-hidden hover:ring-2 hover:ring-indigo-500 transition-all group"
          >
            {/* NFT Image */}
            <div className="aspect-square bg-gray-600 relative overflow-hidden">
              <img
                src={nft.imageUrl}
                alt={nft.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute top-2 right-2">
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(nft.status)}`}
                >
                  {nft.status}
                </span>
              </div>
            </div>

            {/* NFT Info */}
            <div className="p-4">
              <h3 className="text-white font-semibold mb-1 truncate">{nft.name}</h3>
              <p className="text-gray-400 text-sm mb-3 line-clamp-2">{nft.description}</p>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-gray-600 rounded p-2">
                  <div className="text-gray-400 text-xs mb-1">Price</div>
                  <div className="text-white text-sm font-semibold">{nft.price.toFixed(4)} ETH</div>
                </div>
                <div className="bg-gray-600 rounded p-2">
                  <div className="text-gray-400 text-xs mb-1">Sales</div>
                  <div className="text-white text-sm font-semibold">{nft.salesCount}</div>
                </div>
              </div>

              {/* Royalties */}
              {nft.royaltiesEarned > 0 && (
                <div className="flex items-center gap-1 text-green-500 text-sm mb-3">
                  <TrendingUp className="w-4 h-4" />
                  <span>${nft.royaltiesEarned.toFixed(2)} royalties</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <a
                  href={nft.zoraUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  View on Zora
                </a>
                {nft.status === 'listed' && (
                  <button
                    className="flex items-center justify-center bg-gray-600 hover:bg-gray-500 text-white px-3 py-2 rounded-lg transition-colors"
                    title="Update Price"
                  >
                    <DollarSign className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-gray-400 text-sm">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePreviousPage}
              disabled={currentPage === 1}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                currentPage === 1
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-gray-700 text-white hover:bg-gray-600'
              }`}
            >
              Previous
            </button>
            <button
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                currentPage === totalPages
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-gray-700 text-white hover:bg-gray-600'
              }`}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
