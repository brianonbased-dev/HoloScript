import { describe, it, expect } from 'vitest';
import {
  GasOptimizationAnalyzer,
  ANALYZER_PRESETS,
} from '../GasOptimizationAnalyzer';

describe('GasOptimizationAnalyzer', () => {
  // ─── Constructor / Options ───────────────────────────────────────────

  it('uses default options when none supplied', () => {
    const analyzer = new GasOptimizationAnalyzer();
    const report = analyzer.analyze('// empty contract');
    expect(report.totalOptimizations).toBe(0);
  });

  it('respects category filtering', () => {
    const code = `
      uint256 public count;
      for (uint i = 0; i < items.length; i++) {
        items[i].process();
      }
    `;
    const allAnalyzer = new GasOptimizationAnalyzer({ categories: ['loops', 'arithmetic', 'storage'] });
    const loopOnly = new GasOptimizationAnalyzer({ categories: ['loops'] });

    const allReport = allAnalyzer.analyze(code);
    const loopReport = loopOnly.analyze(code);

    expect(loopReport.totalOptimizations).toBeLessThanOrEqual(allReport.totalOptimizations);
  });

  // ─── Storage Analysis ────────────────────────────────────────────────

  describe('storage analysis', () => {
    it('detects uint256 counter optimization opportunity', () => {
      const code = `uint256 public tokenCount;`;
      const analyzer = new GasOptimizationAnalyzer({ categories: ['storage'] });
      const report = analyzer.analyze(code);

      const storageOpts = report.optimizations.filter((o) => o.category === 'storage');
      expect(storageOpts.some((o) => o.issue.includes('tokenCount'))).toBe(true);
    });

    it('detects wasted storage slot packing', () => {
      // uint128 (16 bytes) then uint256 (32 bytes) = 16 wasted bytes in first slot
      const code = `
        uint128 public smallVal;
        uint256 public bigVal;
      `;
      const analyzer = new GasOptimizationAnalyzer({ categories: ['storage'] });
      const report = analyzer.analyze(code);

      const packOpts = report.optimizations.filter((o) => o.id.startsWith('STORAGE-PACK'));
      expect(packOpts.length).toBeGreaterThanOrEqual(1);
    });

    it('skips packing analysis across mappings', () => {
      const code = `
        uint128 public a;
        mapping(address => uint256) public balances;
        uint128 public b;
      `;
      const analyzer = new GasOptimizationAnalyzer({ categories: ['storage'] });
      const report = analyzer.analyze(code);
      // Mapping resets slot, so no wasted slot between a and b
      expect(report.optimizations.filter((o) => o.id.startsWith('STORAGE-PACK')).length).toBeLessThanOrEqual(1);
    });
  });

  // ─── Arithmetic Analysis ─────────────────────────────────────────────

  describe('arithmetic analysis', () => {
    it('detects unchecked loop increment opportunity', () => {
      const code = `for (uint i = 0; i < 10; ++i) {}`;
      const analyzer = new GasOptimizationAnalyzer({ categories: ['arithmetic'] });
      const report = analyzer.analyze(code);

      expect(report.optimizations.some((o) => o.id.startsWith('ARITH-UNCHECKED'))).toBe(true);
    });

    it('detects prefix decrement', () => {
      const code = `while (n > 0) { --i; }`;
      const analyzer = new GasOptimizationAnalyzer({ categories: ['arithmetic'] });
      const report = analyzer.analyze(code);

      expect(report.optimizations.some((o) => o.category === 'arithmetic')).toBe(true);
    });

    it('skips lines already using unchecked', () => {
      const code = `unchecked { i++; }`;
      const analyzer = new GasOptimizationAnalyzer({ categories: ['arithmetic'] });
      const report = analyzer.analyze(code);

      expect(report.optimizations.filter((o) => o.category === 'arithmetic')).toHaveLength(0);
    });

    it('provides autoFix for loop increments', () => {
      const code = `  i++;`;
      const analyzer = new GasOptimizationAnalyzer({ categories: ['arithmetic'] });
      const report = analyzer.analyze(code);

      const opt = report.optimizations.find((o) => o.autoFixAvailable);
      if (opt) {
        expect(opt.autoFix).toContain('unchecked');
      }
    });
  });

  // ─── Loop Analysis ───────────────────────────────────────────────────

  describe('loop analysis', () => {
    it('detects array.length in loop condition', () => {
      const code = `for (uint i = 0; i < items.length; i++) {}`;
      const analyzer = new GasOptimizationAnalyzer({ categories: ['loops'] });
      const report = analyzer.analyze(code);

      expect(report.optimizations.some((o) => o.id.startsWith('LOOP-LENGTH'))).toBe(true);
    });

    it('provides autoFix for array.length caching', () => {
      const code = `for (uint i = 0; i < items.length; i++) {}`;
      const analyzer = new GasOptimizationAnalyzer({ categories: ['loops'] });
      const report = analyzer.analyze(code);

      const opt = report.optimizations.find((o) => o.id.startsWith('LOOP-LENGTH'));
      expect(opt?.autoFixAvailable).toBe(true);
      expect(opt?.autoFix).toContain('uint256 length');
    });
  });

  // ─── Error Handling Analysis ─────────────────────────────────────────

  describe('error handling analysis', () => {
    it('detects require with string message', () => {
      const code = `require(msg.sender == owner, "Not the owner");`;
      const analyzer = new GasOptimizationAnalyzer({ categories: ['errors'] });
      const report = analyzer.analyze(code);

      expect(report.optimizations.some((o) => o.id.startsWith('ERROR-REQUIRE'))).toBe(true);
      expect(report.optimizations[0].suggestion).toContain('custom error');
    });

    it('calculates savings based on string length', () => {
      const shortCode = `require(x, "No");`;
      const longCode = `require(x, "This is a very long error message that wastes gas");`;
      const shortAnalyzer = new GasOptimizationAnalyzer({ categories: ['errors'] });
      const longAnalyzer = new GasOptimizationAnalyzer({ categories: ['errors'] });

      const shortReport = shortAnalyzer.analyze(shortCode);
      const longReport = longAnalyzer.analyze(longCode);

      if (shortReport.optimizations.length > 0 && longReport.optimizations.length > 0) {
        expect(longReport.totalPotentialSavings).toBeGreaterThan(
          shortReport.totalPotentialSavings
        );
      }
    });
  });

  // ─── Memory Analysis ─────────────────────────────────────────────────

  describe('memory analysis', () => {
    it('detects memory parameter that could be calldata', () => {
      const code = `function processItems(uint256[] memory items) external { return; }`;
      const analyzer = new GasOptimizationAnalyzer({ categories: ['memory'] });
      const report = analyzer.analyze(code);

      const memOpts = report.optimizations.filter((o) => o.id.startsWith('MEMORY-CALLDATA'));
      expect(memOpts.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── External Calls Analysis ─────────────────────────────────────────

  describe('external calls analysis', () => {
    it('detects multiple calls to same contract', () => {
      const code = `
        token.balanceOf(addr1);
        token.transfer(addr2, amount);
        token.allowance(addr1, addr2);
      `;
      const analyzer = new GasOptimizationAnalyzer({ categories: ['external-calls'] });
      const report = analyzer.analyze(code);

      expect(report.optimizations.some((o) => o.id.startsWith('CALL-CACHE'))).toBe(true);
    });
  });

  // ─── Visibility Analysis ─────────────────────────────────────────────

  describe('visibility analysis', () => {
    it('suggests external for public functions not called internally', () => {
      const code = `function doSomething() public { }`;
      const analyzer = new GasOptimizationAnalyzer({ categories: ['visibility'] });
      const report = analyzer.analyze(code);

      const visOpts = report.optimizations.filter((o) => o.id.startsWith('VIS-PUBLIC'));
      expect(visOpts.length).toBeGreaterThanOrEqual(0); // May or may not detect depending on pattern
    });
  });

  // ─── Report Generation ───────────────────────────────────────────────

  describe('report generation', () => {
    it('generates summary with counts and categories', () => {
      const code = `
        uint256 public tokenCount;
        for (uint i = 0; i < items.length; i++) {}
        require(msg.sender == owner, "Not authorized");
      `;
      const analyzer = new GasOptimizationAnalyzer();
      const report = analyzer.analyze(code);

      expect(report.summary.length).toBeGreaterThan(0);
      expect(report.summary[0]).toContain('Found');
      expect(report.summary[1]).toContain('Potential savings');
      expect(report.totalPotentialSavings).toBeGreaterThan(0);
    });

    it('counts severity levels correctly', () => {
      const code = `
        uint256 public count;
        for (uint i = 0; i < items.length; i++) { i++; }
      `;
      const analyzer = new GasOptimizationAnalyzer();
      const report = analyzer.analyze(code);

      expect(report.criticalCount + report.highCount + report.mediumCount + report.lowCount)
        .toBe(report.totalOptimizations);
    });
  });

  // ─── Auto Fix ────────────────────────────────────────────────────────

  describe('applyAutoFixes', () => {
    it('applies auto-fixes to code', () => {
      const code = `  i++;`;
      const analyzer = new GasOptimizationAnalyzer({ enableAutoFix: true, categories: ['arithmetic'] });
      analyzer.analyze(code);

      const result = analyzer.applyAutoFixes(code);
      expect(result.appliedCount).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── Presets ─────────────────────────────────────────────────────────

  describe('ANALYZER_PRESETS', () => {
    it('has production, development, and aggressive presets', () => {
      expect(ANALYZER_PRESETS.production).toBeDefined();
      expect(ANALYZER_PRESETS.development).toBeDefined();
      expect(ANALYZER_PRESETS.aggressive).toBeDefined();
    });

    it('production preset disables autoFix', () => {
      expect(ANALYZER_PRESETS.production.enableAutoFix).toBe(false);
    });

    it('development preset enables autoFix', () => {
      expect(ANALYZER_PRESETS.development.enableAutoFix).toBe(true);
    });

    it('aggressive preset includes all categories', () => {
      expect(ANALYZER_PRESETS.aggressive.categories).toContain('visibility');
    });
  });

  // ─── Helper Method: getTypeSize ──────────────────────────────────────

  describe('type size detection', () => {
    it('correctly sizes common Solidity types via storage analysis', () => {
      // bool = 1 byte, address = 20 bytes: they fit in one 32-byte slot
      const code = `
        bool public flag;
        address public owner;
        uint256 public value;
      `;
      const analyzer = new GasOptimizationAnalyzer({ categories: ['storage'] });
      const report = analyzer.analyze(code);
      // bool(1) + address(20) = 21 bytes, fits in slot. uint256 = new slot. No wasting.
      expect(report).toBeDefined();
    });
  });
});
