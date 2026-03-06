'use client';

/**
 * useMarketplace — React hook for HoloScript Marketplace
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  MarketplaceRegistry, type PackageListing, type MarketplaceSearchFilters,
  type MarketplaceSearchResult, type InstallManifest,
  createSubmission, verifySubmission, publishSubmission,
  type MarketplacePackage, type MarketplaceSubmissionType,
} from '@holoscript/core';
import { seedMarketplace } from '../../data/marketplace-seeds';

// ═══════════════════════════════════════════════════════════════════

export interface UseMarketplaceReturn {
  results: MarketplaceSearchResult | null;
  selected: PackageListing | null;
  installed: InstallManifest[];
  stats: ReturnType<MarketplaceRegistry['stats']>;
  search: (filters?: MarketplaceSearchFilters) => MarketplaceSearchResult;
  select: (packageId: string) => PackageListing | undefined;
  install: (packageId: string, worldId: string) => InstallManifest;
  uninstall: (packageId: string, worldId: string) => boolean;
  rate: (packageId: string, rating: number) => boolean;
  submit: (pkg: MarketplacePackage) => MarketplaceSubmissionType;
  getInstalled: (worldId: string) => InstallManifest[];
}

let _registry: MarketplaceRegistry | null = null;
function getRegistry(): MarketplaceRegistry {
  if (!_registry) _registry = seedMarketplace(); // Auto-seed on first access
  return _registry;
}

export function useMarketplace(worldId: string = 'default'): UseMarketplaceReturn {
  const registryRef = useRef(getRegistry());
  const [results, setResults] = useState<MarketplaceSearchResult | null>(null);
  const [selected, setSelected] = useState<PackageListing | null>(null);
  const [installed, setInstalled] = useState<InstallManifest[]>([]);
  const [stats, setStats] = useState(registryRef.current.stats());

  const refresh = useCallback(() => {
    setInstalled(registryRef.current.getInstalled(worldId));
    setStats(registryRef.current.stats());
  }, [worldId]);

  useEffect(() => { refresh(); }, [refresh]);

  const search = useCallback((filters: MarketplaceSearchFilters = {}) => {
    const res = registryRef.current.search(filters);
    setResults(res);
    return res;
  }, []);

  const select = useCallback((packageId: string) => {
    const pkg = registryRef.current.get(packageId);
    setSelected(pkg || null);
    return pkg;
  }, []);

  const install = useCallback((packageId: string, wId: string) => {
    const manifest = registryRef.current.install(packageId, wId);
    refresh();
    return manifest;
  }, [refresh]);

  const uninstall = useCallback((packageId: string, wId: string) => {
    const result = registryRef.current.uninstall(packageId, wId);
    refresh();
    return result;
  }, [refresh]);

  const rate = useCallback((packageId: string, rating: number) => {
    return registryRef.current.rate(packageId, rating);
  }, []);

  const submit = useCallback((pkg: MarketplacePackage) => {
    const sub = createSubmission(pkg);
    verifySubmission(sub);
    if (sub.status === 'verified') {
      publishSubmission(sub);
      if (sub.status === 'published') {
        registryRef.current.publish(sub);
        refresh();
      }
    }
    return sub;
  }, [refresh]);

  const getInstalled = useCallback((wId: string) => registryRef.current.getInstalled(wId), []);

  return { results, selected, installed, stats, search, select, install, uninstall, rate, submit, getInstalled };
}
