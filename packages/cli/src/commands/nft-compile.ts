/**
 * NFT Marketplace Compilation Command
 *
 * CLI command to compile HoloScript NFT marketplace DSL to Solidity
 *
 * Usage:
 *   holoscript nft-compile <marketplace-file> [options]
 */

import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { NFTMarketplaceCompiler } from '@holoscript/core/compiler/NFTMarketplaceCompiler';
import {
  _GasOptimizationAnalyzer,
  _ANALYZER_PRESETS,
} from '@holoscript/core/compiler/GasOptimizationAnalyzer';
import type { NFTMarketplaceAST } from '@holoscript/core/parser/NFTMarketplaceTypes';

export interface NFTCompileOptions {
  output?: string;
  solcVersion?: string;
  optimizerRuns?: number;
  gasAnalysis?: boolean;
  generateTests?: boolean;
  generateDocs?: boolean;
  verbose?: boolean;
}

export async function nftCompileCommand(
  marketplaceFile: string,
  options: NFTCompileOptions
): Promise<void> {
  const spinner = ora('Compiling NFT marketplace...').start();

  try {
    // Read marketplace definition
    const marketplaceCode = await fs.readFile(marketplaceFile, 'utf-8');

    // Parse to AST (simplified - in real implementation would use parser)
    const marketplaceAST = parseMarketplaceDefinition(marketplaceCode);

    // Configure compiler
    const compiler = new NFTMarketplaceCompiler({
      solcVersion: options.solcVersion || '0.8.20',
      optimizer: {
        enabled: true,
        runs: options.optimizerRuns || 200,
      },
      generateTests: options.generateTests ?? false,
      includeNatSpec: true,
      licenseType: 'MIT',
    });

    spinner.text = 'Generating Solidity contracts...';

    // Compile
    const output = compiler.compile(marketplaceAST);

    spinner.succeed('Compilation successful!');

    // Output directory
    const outputDir = options.output || path.join(process.cwd(), 'generated');
    await fs.mkdir(outputDir, { recursive: true });

    // Write contracts
    console.log(chalk.blue('\n📝 Writing contracts...'));
    for (const contract of output.contracts) {
      const contractPath = path.join(outputDir, 'contracts', `${contract.name}.sol`);
      await fs.mkdir(path.dirname(contractPath), { recursive: true });
      await fs.writeFile(contractPath, contract.solidity);
      console.log(chalk.green(`  ✓ ${contract.name}.sol`));
    }

    // Write deployment scripts
    console.log(chalk.blue('\n🚀 Writing deployment scripts...'));
    for (const script of output.deploymentScripts) {
      const scriptPath = path.join(outputDir, 'deploy', `deploy-${script.chain}.ts`);
      await fs.mkdir(path.dirname(scriptPath), { recursive: true });
      await fs.writeFile(scriptPath, script.script);
      console.log(chalk.green(`  ✓ deploy-${script.chain}.ts`));
    }

    // Gas analysis
    if (options.gasAnalysis && output.gasAnalysis) {
      console.log(chalk.blue('\n⚡ Gas Analysis Report:'));
      console.log(chalk.gray('─'.repeat(60)));

      console.log(chalk.yellow(`\nTotal Optimizations: ${output.gasAnalysis.totalOptimizations}`));
      console.log(
        chalk.yellow(
          `Potential Savings: ~${output.gasAnalysis.estimatedSavings.toLocaleString()} gas`
        )
      );

      console.log(chalk.gray('\nSeverity Breakdown:'));
      console.log(`  ${chalk.red('Critical')}: ${output.gasAnalysis.criticalIssues.length}`);
      console.log(
        `  ${chalk.yellow('High')}: ${output.gasAnalysis.criticalIssues.filter((i) => i.severity === 'high').length}`
      );
      console.log(
        `  ${chalk.blue('Medium')}: ${output.gasAnalysis.criticalIssues.filter((i) => i.severity === 'medium').length}`
      );

      if (output.gasAnalysis.criticalIssues.length > 0) {
        console.log(chalk.gray('\nTop Issues:'));
        for (const issue of output.gasAnalysis.criticalIssues.slice(0, 5)) {
          console.log(`  ${chalk.yellow('•')} ${issue.issue}`);
          console.log(`    ${chalk.gray(issue.suggestion)}`);
          console.log(`    ${chalk.green(`Savings: ~${issue.potentialSavings} gas`)}`);
        }
      }

      console.log(chalk.gray('\nRecommendations:'));
      for (const rec of output.gasAnalysis.recommendations.slice(0, 5)) {
        console.log(`  ${chalk.blue('→')} ${rec}`);
      }

      // Write full report
      const reportPath = path.join(outputDir, 'gas-analysis.json');
      await fs.writeFile(reportPath, JSON.stringify(output.gasAnalysis, null, 2));
      console.log(chalk.gray(`\nFull report: ${reportPath}`));
    }

    // Warnings
    if (output.warnings && output.warnings.length > 0) {
      console.log(chalk.yellow('\n⚠️  Warnings:'));
      for (const warning of output.warnings) {
        console.log(chalk.yellow(`  • ${warning}`));
      }
    }

    // Deployment cost estimates
    if (output.estimatedDeploymentCost) {
      console.log(chalk.blue('\n💰 Estimated Deployment Costs:'));
      for (const [chain, cost] of Object.entries(output.estimatedDeploymentCost)) {
        console.log(chalk.gray(`  ${chain}: ${cost}`));
      }
    }

    // Summary
    console.log(chalk.blue('\n📊 Summary:'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log(`  Contracts generated: ${chalk.green(output.contracts.length)}`);
    console.log(`  Deployment scripts: ${chalk.green(output.deploymentScripts.length)}`);
    console.log(`  Output directory: ${chalk.cyan(outputDir)}`);

    console.log(chalk.green('\n✨ Compilation complete!\n'));

    // Next steps
    console.log(chalk.blue('📖 Next steps:'));
    console.log(
      chalk.gray('  1. Review generated contracts in ' + chalk.cyan(`${outputDir}/contracts/`))
    );
    console.log(
      chalk.gray('  2. Install dependencies: ' + chalk.cyan('npm install @openzeppelin/contracts'))
    );
    console.log(
      chalk.gray(
        '  3. Deploy to testnet: ' +
          chalk.cyan('npx hardhat run deploy/deploy-base.ts --network base-goerli')
      )
    );
    console.log(chalk.gray('  4. Verify contracts on block explorer'));
    console.log(chalk.gray('  5. Deploy to mainnet when ready\n'));
  } catch (error) {
    spinner.fail('Compilation failed');
    console.error(chalk.red('\n❌ Error:'), error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

/**
 * Parse marketplace definition from HoloScript code
 * (Simplified parser - real implementation would use full parser)
 */
export function parseMarketplaceDefinition(_code: string): NFTMarketplaceAST {
  // This is a simplified example
  // Real implementation would parse the .holo syntax properly

  return {
    type: 'NFTMarketplace',
    name: 'ExampleMarketplace',
    chains: [
      {
        network: 'base',
        chainId: 8453,
        testnet: false,
      },
    ],
    contracts: [
      {
        name: 'ExampleNFT',
        symbol: 'NFT',
        standard: 'ERC1155',
        maxSupply: 10000,
        mintable: true,
        burnable: true,
        pausable: true,
        upgradeable: false,
        metadata: {
          baseURI: 'ipfs://example/',
          dynamic: true,
        },
      },
    ],
    royalties: {
      defaultRoyalty: {
        receiver: '0x0000000000000000000000000000000000000001',
        bps: 500,
      },
      upgradeable: false,
    },
    lazyMinting: {
      enabled: true,
      voucherVersion: '1',
      signingDomain: 'ExampleNFT',
    },
    gasOptimization: {
      storageOptimization: true,
      batchOperations: true,
      enableStaticAnalysis: true,
    },
  };
}

// CLI integration
export function registerNFTCompileCommand(program: any): void {
  program
    .command('nft-compile <marketplace-file>')
    .description('Compile NFT marketplace DSL to Solidity')
    .option('-o, --output <dir>', 'Output directory', './generated')
    .option('--solc-version <version>', 'Solidity compiler version', '0.8.20')
    .option('--optimizer-runs <runs>', 'Optimizer runs', '200')
    .option('--gas-analysis', 'Run gas optimization analysis', true)
    .option('--generate-tests', 'Generate test files', false)
    .option('--generate-docs', 'Generate documentation', false)
    .option('-v, --verbose', 'Verbose output', false)
    .action(nftCompileCommand);
}
