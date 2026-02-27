"""
Python MCP Client Example

Demonstrates how to use HoloScript MCP Compiler Tools from Python.
"""

import requests
import json
import time
from typing import Dict, Any, Optional


class HoloScriptMCPClient:
    """MCP Client for HoloScript Compiler Tools"""

    def __init__(self, server_url: str = "http://localhost:8100", api_key: Optional[str] = None):
        self.server_url = server_url.rstrip("/")
        self.headers = {
            "Content-Type": "application/json"
        }
        if api_key:
            self.headers["Authorization"] = f"Bearer {api_key}"
            self.headers["X-Agent-ID"] = "python-example-agent"

    def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Call an MCP tool"""
        response = requests.post(
            f"{self.server_url}/tools/call",
            headers=self.headers,
            json={
                "tool": tool_name,
                "arguments": arguments
            }
        )
        response.raise_for_status()
        return response.json()

    def compile_to_unity(self, code: str, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Compile HoloScript to Unity C#"""
        return self.call_tool("compile_to_unity", {
            "code": code,
            "options": options or {}
        })

    def compile_to_urdf(self, code: str, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Compile HoloScript to URDF for ROS 2"""
        return self.call_tool("compile_to_urdf", {
            "code": code,
            "options": options or {}
        })

    def compile_to_webgpu(self, code: str, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Compile HoloScript to WebGPU"""
        return self.call_tool("compile_to_webgpu", {
            "code": code,
            "options": options or {}
        })

    def compile_to_r3f(self, code: str, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Compile HoloScript to React Three Fiber"""
        return self.call_tool("compile_to_r3f", {
            "code": code,
            "options": options or {}
        })

    def get_compilation_status(self, job_id: str) -> Dict[str, Any]:
        """Get compilation job status"""
        return self.call_tool("get_compilation_status", {"jobId": job_id})

    def list_export_targets(self) -> Dict[str, Any]:
        """List all available export targets"""
        return self.call_tool("list_export_targets", {})

    def get_circuit_breaker_status(self, target: str) -> Dict[str, Any]:
        """Get circuit breaker status for a target"""
        return self.call_tool("get_circuit_breaker_status", {"target": target})


# Example 1: Compile to Unity
def example_unity():
    print("\n--- Example 1: Compile to Unity ---")

    client = HoloScriptMCPClient()

    holo_code = """
    composition "VRRoom" {
      environment {
        skybox: "nebula"
        ambient_light: 0.4
      }

      object "table" @collidable @physics(mass: 10) {
        geometry: "box"
        position: [0, 0.5, 0]
        size: [2, 0.1, 1]
        color: "#8B4513"
      }

      object "sword" @grabbable @throwable {
        geometry: "model"
        model: "assets/sword.glb"
        position: [0, 1.2, 0]
        @physics(mass: 0.5)
      }
    }
    """

    result = client.compile_to_unity(holo_code, {
        "namespace": "MyVRGame",
        "generatePrefabs": True
    })

    print(f"Success: {result['success']}")
    print(f"Job ID: {result['jobId']}")
    print(f"Compilation Time: {result['metadata']['compilationTimeMs']}ms")
    print(f"\nGenerated C# Code:\n{result['output'][:500]}...")


# Example 2: Compile to URDF
def example_urdf():
    print("\n--- Example 2: Compile to URDF ---")

    client = HoloScriptMCPClient()

    holo_code = """
    composition "Robot" {
      object "base_link" @physics(mass: 5.0) {
        geometry: "box"
        size: [0.5, 0.3, 0.2]
        color: "#333333"
      }

      object "wheel_left" @physics(mass: 0.5) {
        geometry: "cylinder"
        radius: 0.15
        length: 0.05
        position: [-0.2, -0.15, 0.3]
      }

      object "wheel_right" @physics(mass: 0.5) {
        geometry: "cylinder"
        radius: 0.15
        length: 0.05
        position: [0.2, -0.15, 0.3]
      }
    }
    """

    result = client.compile_to_urdf(holo_code, {
        "robotName": "my_robot",
        "includeInertial": True
    })

    print(f"Success: {result['success']}")
    print(f"\nGenerated URDF:\n{result['output'][:500]}...")


# Example 3: Compile to React Three Fiber
def example_r3f():
    print("\n--- Example 3: Compile to React Three Fiber ---")

    client = HoloScriptMCPClient()

    holo_code = """
    composition "InteractiveScene" {
      environment {
        skybox: "sunset"
      }

      object "cube" @hoverable @clickable {
        geometry: "cube"
        position: [0, 1, 0]
        color: "#FF6B6B"
        @state(hovered: false, clicked: false)
      }

      object "sphere" @grabbable {
        geometry: "sphere"
        position: [2, 1, 0]
        radius: 0.5
        color: "#4ECDC4"
      }
    }
    """

    result = client.compile_to_r3f(holo_code, {
        "typescript": True,
        "environmentPreset": "sunset"
    })

    print(f"Success: {result['success']}")
    print(f"\nGenerated R3F Component:\n{result['output'][:500]}...")


# Example 4: Compile with job tracking
def example_job_tracking():
    print("\n--- Example 4: Compile with Job Tracking ---")

    client = HoloScriptMCPClient()

    # Start compilation
    result = client.call_tool("compile_holoscript", {
        "code": 'composition "Scene" { object "cube" { geometry: "cube" } }',
        "target": "webgpu"
    })

    job_id = result['jobId']
    print(f"Started compilation job: {job_id}")

    # Poll for status
    for _ in range(10):
        status = client.get_compilation_status(job_id)
        print(f"Progress: {status['progress']}% - Status: {status['status']}")

        if status['status'] in ['completed', 'failed']:
            break

        time.sleep(2)

    if status['status'] == 'completed':
        print("Compilation complete!")
        print(f"Output size: {status['result']['metadata']['outputSizeBytes']} bytes")
    else:
        print(f"Compilation failed: {status['result'].get('error', 'Unknown error')}")


# Example 5: List export targets
def example_list_targets():
    print("\n--- Example 5: List Export Targets ---")

    client = HoloScriptMCPClient()
    result = client.list_export_targets()

    print(f"Total targets: {len(result['targets'])}")
    print("\nCategories:")

    for category, targets in result['categories'].items():
        print(f"\n{category}:")
        for target in targets:
            print(f"  - {target}")


# Example 6: Check circuit breaker
def example_circuit_breaker():
    print("\n--- Example 6: Check Circuit Breaker ---")

    client = HoloScriptMCPClient()
    result = client.get_circuit_breaker_status("unity")

    print(f"Circuit Breaker Status for unity:")
    print(f"State: {result['state']}")
    print(f"Total Requests: {result['totalRequests']}")
    print(f"Success Count: {result['successCount']}")
    print(f"Failure Count: {result['failureCount']}")
    print(f"Failure Rate: {result['failureRate']:.2f} failures/hour")
    print(f"Can Retry: {result['canRetry']}")

    if result['lastError']:
        print(f"Last Error: {result['lastError']}")


def main():
    print("=== HoloScript MCP Compiler Tools - Python Examples ===")

    try:
        example_unity()
        example_urdf()
        example_r3f()
        example_job_tracking()
        example_list_targets()
        example_circuit_breaker()

    except requests.exceptions.ConnectionError:
        print("\nError: Could not connect to MCP server. Is it running on port 8100?")
    except Exception as e:
        print(f"\nError: {e}")


if __name__ == "__main__":
    main()
