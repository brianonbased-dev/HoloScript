/**
 * Narupa Process Manager v1.0
 * Manages lifecycle of Narupa server Python processes
 * Communicates with Python bridge via JSON-RPC over stdin/stdout
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as path from 'path';
import { NarupaServerConfig, NarupaServerStatus } from './types';

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timeout: NodeJS.Timeout;
}

export class NarupaProcessManager extends EventEmitter {
  private bridgeProcess: ChildProcess | null = null;
  private servers: Map<number, NarupaServerStatus> = new Map();
  private nextRequestId = 1;
  private pendingRequests: Map<number, PendingRequest> = new Map();
  private nextPort = 38801;
  private pythonPath: string;
  private bridgePath: string;
  private shutdownInProgress = false;

  /**
   * Create a new Narupa Process Manager
   * @param pythonPath Path to Python executable (default: 'python')
   * @param bridgePath Path to Python bridge script
   */
  constructor(pythonPath: string = 'python', bridgePath?: string) {
    super();
    this.pythonPath = pythonPath;
    this.bridgePath = bridgePath || path.join(__dirname, '../python/holoscript_narupa_bridge.py');
  }

  /**
   * Initialize the Python bridge process
   */
  async initialize(): Promise<void> {
    if (this.bridgeProcess) {
      throw new Error('Bridge process already initialized');
    }

    return new Promise((resolve, reject) => {
      try {
        // Spawn Python bridge process
        this.bridgeProcess = spawn(this.pythonPath, [this.bridgePath, '--mode', 'rpc'], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        // Setup stdout handler for JSON-RPC responses
        let buffer = '';
        this.bridgeProcess.stdout?.on('data', (data: Buffer) => {
          buffer += data.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim()) {
              try {
                const response = JSON.parse(line);
                this.handleRpcResponse(response);
              } catch (err) {
                this.emit('error', new Error(`Failed to parse JSON-RPC response: ${err}`));
              }
            }
          }
        });

        // Setup stderr handler for logging
        this.bridgeProcess.stderr?.on('data', (data: Buffer) => {
          const message = data.toString().trim();
          if (message) {
            this.emit('log', { level: 'info', message });
          }
        });

        // Handle process exit
        this.bridgeProcess.on('exit', (code, signal) => {
          this.emit('bridge-exit', { code, signal });
          this.bridgeProcess = null;
          this.servers.clear();

          if (!this.shutdownInProgress) {
            this.emit(
              'error',
              new Error(`Bridge process exited unexpectedly: code=${code}, signal=${signal}`)
            );
          }
        });

        // Handle process errors
        this.bridgeProcess.on('error', (err) => {
          this.emit('error', new Error(`Bridge process error: ${err.message}`));
          reject(err);
        });

        // Test the bridge with a ping
        setTimeout(async () => {
          try {
            const result = await this.sendRpcRequest('ping', {});
            if (result.status === 'pong') {
              this.emit('initialized');
              resolve();
            } else {
              reject(new Error('Bridge ping failed'));
            }
          } catch (err) {
            reject(err);
          }
        }, 500);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Send a JSON-RPC request to the Python bridge
   */
  private sendRpcRequest(method: string, params: any, timeout: number = 30000): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.bridgeProcess || !this.bridgeProcess.stdin) {
        reject(new Error('Bridge process not initialized'));
        return;
      }

      const id = this.nextRequestId++;
      const request = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      // Setup timeout
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, timeout);

      // Store pending request
      this.pendingRequests.set(id, { resolve, reject, timeout: timeoutHandle });

      // Send request
      try {
        const requestStr = JSON.stringify(request) + '\n';
        this.bridgeProcess.stdin.write(requestStr);
      } catch (err) {
        this.pendingRequests.delete(id);
        clearTimeout(timeoutHandle);
        reject(err);
      }
    });
  }

  /**
   * Handle JSON-RPC response from Python bridge
   */
  private handleRpcResponse(response: any): void {
    const id = response.id;
    if (id === undefined || id === null) {
      this.emit('error', new Error('Received response without id'));
      return;
    }

    const pending = this.pendingRequests.get(id);
    if (!pending) {
      this.emit('error', new Error(`Received response for unknown request id: ${id}`));
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(id);

    if (response.error) {
      pending.reject(
        new Error(`RPC Error: ${response.error.message} (code: ${response.error.code})`)
      );
    } else {
      pending.resolve(response.result);
    }
  }

  /**
   * Start a new Narupa server process
   */
  async startServer(config: NarupaServerConfig): Promise<NarupaServerStatus> {
    if (!this.bridgeProcess) {
      await this.initialize();
    }

    // Assign port if not specified
    const serverConfig = {
      pdb_path: config.pdbPath,
      port: config.port || this.nextPort,
      md_engine: config.mdEngine || 'openmm',
      temperature: config.temperature || 300,
      timestep: config.timestep || 2.0,
      steps: config.steps,
    };

    try {
      const result = await this.sendRpcRequest('start_server', serverConfig);

      if (result.status === 'error') {
        throw new Error(result.error);
      }

      const status: NarupaServerStatus = {
        pid: result.server_id,
        port: result.port,
        running: true,
        numAtoms: result.num_atoms,
      };

      this.servers.set(result.server_id, status);
      this.nextPort = result.port + 1;

      this.emit('server-started', status);
      return status;
    } catch (err) {
      const error = err as Error;
      throw new Error(`Failed to start server: ${error.message}`);
    }
  }

  /**
   * Stop a running Narupa server
   */
  async stopServer(pid: number): Promise<void> {
    if (!this.servers.has(pid)) {
      throw new Error(`Server ${pid} not found`);
    }

    try {
      const result = await this.sendRpcRequest('stop_server', { server_id: pid });

      if (result.status === 'error') {
        throw new Error(result.error);
      }

      this.servers.delete(pid);
      this.emit('server-stopped', { pid });
    } catch (err) {
      const error = err as Error;
      throw new Error(`Failed to stop server: ${error.message}`);
    }
  }

  /**
   * Get status of a server process
   */
  async getServerStatus(pid: number): Promise<NarupaServerStatus | null> {
    try {
      const result = await this.sendRpcRequest('get_status', { server_id: pid });

      if (result.status === 'not_found') {
        return null;
      }

      const status: NarupaServerStatus = {
        pid: result.server_id,
        port: result.port,
        running: result.status === 'running',
        numAtoms: result.num_atoms,
      };

      // Update local cache
      if (status.running) {
        this.servers.set(pid, status);
      } else {
        this.servers.delete(pid);
      }

      return status;
    } catch (_err) {
      return null;
    }
  }

  /**
   * List all active servers
   */
  async listServers(): Promise<NarupaServerStatus[]> {
    try {
      const result = await this.sendRpcRequest('list_servers', {});

      if (result.status === 'success') {
        return result.servers.map((s: any) => ({
          pid: s.server_id,
          port: s.port,
          running: s.running,
          numAtoms: s.num_atoms,
        }));
      }

      return [];
    } catch (_err) {
      return [];
    }
  }

  /**
   * Stop all running servers
   */
  async stopAllServers(): Promise<void> {
    const pids = Array.from(this.servers.keys());
    const promises = pids.map((pid) =>
      this.stopServer(pid).catch((err) => {
        this.emit('error', new Error(`Failed to stop server ${pid}: ${err.message}`));
      })
    );

    await Promise.all(promises);
  }

  /**
   * Shutdown the bridge process gracefully
   */
  async shutdown(): Promise<void> {
    if (!this.bridgeProcess) {
      return;
    }

    this.shutdownInProgress = true;

    try {
      // Stop all servers first
      await this.stopAllServers();

      // Shutdown bridge
      await this.sendRpcRequest('shutdown_all', {}, 5000);

      // Give it time to exit gracefully
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Force kill if still alive
      if (this.bridgeProcess) {
        this.bridgeProcess.kill('SIGTERM');
        await new Promise((resolve) => setTimeout(resolve, 500));

        if (this.bridgeProcess) {
          this.bridgeProcess.kill('SIGKILL');
        }
      }
    } catch (_err) {
      // Force kill on error
      if (this.bridgeProcess) {
        this.bridgeProcess.kill('SIGKILL');
      }
    } finally {
      this.bridgeProcess = null;
      this.servers.clear();
      this.pendingRequests.clear();
      this.shutdownInProgress = false;
      this.emit('shutdown');
    }
  }

  /**
   * Check if the bridge process is running
   */
  isRunning(): boolean {
    return this.bridgeProcess !== null;
  }

  /**
   * Get the number of active servers
   */
  getServerCount(): number {
    return this.servers.size;
  }
}
