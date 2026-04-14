"""
HoloScript-Narupa Bridge v1.0
Python bridge for spawning and controlling Narupa servers
Communicates with HoloScript compiler via stdin/stdout JSON-RPC
"""

import sys
import json
import argparse
import threading
import signal
from pathlib import Path
from typing import Dict, Any, Optional
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.FileHandler('narupa_bridge.log'), logging.StreamHandler(sys.stderr)]
)
logger = logging.getLogger(__name__)


class NarupaBridge:
    """Main bridge class for managing Narupa servers"""

    def __init__(self):
        self.servers: Dict[int, Any] = {}
        self.server_threads: Dict[int, threading.Thread] = {}
        self.next_port = 38801
        self.shutdown_flag = threading.Event()

        # Try to import Narupa SDK
        try:
            from nanover.app import NanoverImdApplication
            from nanover.openmm import OpenMMSimulation
            self.NanoverImdApplication = NanoverImdApplication
            self.OpenMMSimulation = OpenMMSimulation
            self.narupa_available = True
            logger.info("Narupa SDK loaded successfully")
        except ImportError as e:
            logger.warning(f"Narupa SDK not available: {e}. Running in stub mode.")
            self.narupa_available = False

    def start_server(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Start a Narupa server with the given configuration

        Args:
            config: Server configuration dict with keys:
                - pdb_path: Path to PDB file (required)
                - port: Server port (default: auto-assign)
                - md_engine: 'openmm' or 'ase' (default: 'openmm')
                - temperature: Simulation temperature in Kelvin (default: 300)
                - timestep: Timestep in femtoseconds (default: 2.0)
                - steps: Number of steps (optional, for finite sims)

        Returns:
            Result dict with status, pid, port, num_atoms
        """
        if not self.narupa_available:
            return {
                'status': 'error',
                'error': 'Narupa SDK not installed. Install with: pip install nanover-server'
            }

        pdb_path = config.get('pdb_path')
        if not pdb_path:
            return {'status': 'error', 'error': 'pdb_path is required'}

        pdb_file = Path(pdb_path)
        if not pdb_file.exists():
            return {'status': 'error', 'error': f'PDB file not found: {pdb_path}'}

        # Extract configuration
        port = config.get('port', self.next_port)
        md_engine = config.get('md_engine', 'openmm')
        temperature = config.get('temperature', 300)  # Kelvin
        timestep = config.get('timestep', 2.0)  # femtoseconds
        steps = config.get('steps', None)

        try:
            # Create OpenMM simulation from PDB
            logger.info(f"Loading PDB file: {pdb_path}")
            simulation = self.OpenMMSimulation.from_pdb(
                str(pdb_file),
                temperature=temperature,
                timestep=timestep
            )

            num_atoms = simulation.system.getNumParticles()
            logger.info(f"Loaded {num_atoms} atoms from {pdb_file.name}")

            # Create Narupa IMD application
            app = self.NanoverImdApplication.basic_server(simulation)

            # Start server in background thread
            def run_server():
                try:
                    logger.info(f"Starting Narupa server on port {port}")
                    app.server.start_server(port=port, address="0.0.0.0")

                    if steps:
                        # Run finite simulation
                        for _ in range(steps):
                            if self.shutdown_flag.is_set():
                                break
                            app.run()
                    else:
                        # Run indefinitely
                        while not self.shutdown_flag.is_set():
                            app.run()

                    logger.info(f"Server on port {port} shutting down")
                    app.close()
                except Exception as e:
                    logger.error(f"Server error on port {port}: {e}")

            thread = threading.Thread(target=run_server, daemon=True)
            thread.start()

            # Store server reference
            server_id = port  # Use port as unique ID
            self.servers[server_id] = {
                'app': app,
                'simulation': simulation,
                'config': config,
                'port': port,
                'num_atoms': num_atoms
            }
            self.server_threads[server_id] = thread

            self.next_port += 1

            return {
                'status': 'success',
                'server_id': server_id,
                'port': port,
                'num_atoms': num_atoms,
                'pdb_file': pdb_file.name
            }

        except Exception as e:
            logger.error(f"Failed to start server: {e}")
            return {'status': 'error', 'error': str(e)}

    def stop_server(self, server_id: int) -> Dict[str, Any]:
        """
        Stop a running Narupa server

        Args:
            server_id: Server ID (typically the port number)

        Returns:
            Result dict with status
        """
        if server_id not in self.servers:
            return {'status': 'error', 'error': f'Server {server_id} not found'}

        try:
            server = self.servers[server_id]
            app = server['app']

            logger.info(f"Stopping server {server_id}")
            app.close()

            # Remove from registry
            del self.servers[server_id]
            if server_id in self.server_threads:
                del self.server_threads[server_id]

            return {'status': 'success', 'server_id': server_id}

        except Exception as e:
            logger.error(f"Failed to stop server {server_id}: {e}")
            return {'status': 'error', 'error': str(e)}

    def get_server_status(self, server_id: int) -> Dict[str, Any]:
        """
        Get status of a server

        Args:
            server_id: Server ID

        Returns:
            Status dict with running state, port, num_atoms
        """
        if server_id not in self.servers:
            return {'status': 'not_found', 'server_id': server_id}

        server = self.servers[server_id]
        thread = self.server_threads.get(server_id)

        return {
            'status': 'running' if thread and thread.is_alive() else 'stopped',
            'server_id': server_id,
            'port': server['port'],
            'num_atoms': server['num_atoms'],
            'pdb_file': server['config'].get('pdb_path')
        }

    def list_servers(self) -> Dict[str, Any]:
        """List all active servers"""
        servers = []
        for server_id, server in self.servers.items():
            thread = self.server_threads.get(server_id)
            servers.append({
                'server_id': server_id,
                'port': server['port'],
                'num_atoms': server['num_atoms'],
                'running': thread.is_alive() if thread else False
            })
        return {'status': 'success', 'servers': servers}

    def shutdown_all(self) -> Dict[str, Any]:
        """Shutdown all servers gracefully"""
        logger.info("Shutting down all servers")
        self.shutdown_flag.set()

        for server_id in list(self.servers.keys()):
            self.stop_server(server_id)

        return {'status': 'success', 'message': 'All servers stopped'}


def handle_rpc_request(bridge: NarupaBridge, request: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle JSON-RPC request from HoloScript compiler

    Supported methods:
    - start_server: Start a new Narupa server
    - stop_server: Stop a running server
    - get_status: Get server status
    - list_servers: List all active servers
    - shutdown_all: Stop all servers

    Args:
        bridge: NarupaBridge instance
        request: JSON-RPC request object

    Returns:
        JSON-RPC response object
    """
    method = request.get('method')
    params = request.get('params', {})
    req_id = request.get('id')

    try:
        if method == 'start_server':
            result = bridge.start_server(params)
        elif method == 'stop_server':
            server_id = params.get('server_id')
            if server_id is None:
                raise ValueError('server_id parameter required')
            result = bridge.stop_server(server_id)
        elif method == 'get_status':
            server_id = params.get('server_id')
            if server_id is None:
                raise ValueError('server_id parameter required')
            result = bridge.get_server_status(server_id)
        elif method == 'list_servers':
            result = bridge.list_servers()
        elif method == 'shutdown_all':
            result = bridge.shutdown_all()
        elif method == 'ping':
            result = {'status': 'pong', 'version': '1.0.0'}
        else:
            return {
                'jsonrpc': '2.0',
                'id': req_id,
                'error': {'code': -32601, 'message': f'Method not found: {method}'}
            }

        return {
            'jsonrpc': '2.0',
            'id': req_id,
            'result': result
        }

    except Exception as e:
        logger.error(f"Error handling method {method}: {e}")
        return {
            'jsonrpc': '2.0',
            'id': req_id,
            'error': {'code': -32603, 'message': f'Internal error: {str(e)}'}
        }


def main():
    """
    Main entry point for stdin/stdout JSON-RPC communication
    Reads JSON-RPC requests from stdin, processes them, writes responses to stdout
    """
    parser = argparse.ArgumentParser(
        description='HoloScript-Narupa Bridge - JSON-RPC server for Narupa integration'
    )
    parser.add_argument(
        '--mode',
        choices=['rpc', 'test'],
        default='rpc',
        help='Operation mode: rpc for production, test for diagnostics'
    )
    parser.add_argument(
        '--log-level',
        choices=['DEBUG', 'INFO', 'WARNING', 'ERROR'],
        default='INFO',
        help='Logging level'
    )
    args = parser.parse_args()

    # Update log level
    logger.setLevel(getattr(logging, args.log_level))

    bridge = NarupaBridge()

    # Setup signal handlers for graceful shutdown
    def signal_handler(sig, frame):
        logger.info("Received shutdown signal")
        bridge.shutdown_all()
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    if args.mode == 'test':
        # Test mode: print diagnostics and exit
        test_result = {
            'status': 'bridge_ready',
            'version': '1.0.0',
            'narupa_available': bridge.narupa_available,
            'python_version': sys.version,
            'supported_methods': [
                'start_server', 'stop_server', 'get_status',
                'list_servers', 'shutdown_all', 'ping'
            ]
        }
        print(json.dumps(test_result, indent=2))
        return

    # RPC mode: JSON-RPC loop on stdin/stdout
    logger.info("Narupa Bridge ready for JSON-RPC requests")

    for line in sys.stdin:
        try:
            line = line.strip()
            if not line:
                continue

            request = json.loads(line)
            response = handle_rpc_request(bridge, request)
            print(json.dumps(response), flush=True)

        except json.JSONDecodeError as e:
            error_response = {
                'jsonrpc': '2.0',
                'error': {
                    'code': -32700,
                    'message': f'Parse error: {str(e)}'
                }
            }
            print(json.dumps(error_response), flush=True)
        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            error_response = {
                'jsonrpc': '2.0',
                'error': {
                    'code': -32603,
                    'message': f'Internal error: {str(e)}'
                }
            }
            print(json.dumps(error_response), flush=True)


if __name__ == '__main__':
    main()
