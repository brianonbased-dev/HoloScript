#!/bin/bash
# Shared Security Functions for Claude Skills
# Version: 1.0
# Date: 2026-02-26
# Purpose: Prevent command injection, path traversal, and other security vulnerabilities

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# ============================================================================
# Path Validation
# ============================================================================

validate_path() {
  local input="$1"
  local allowed_base_dir="$2"
  local must_exist="${3:-true}"

  # Check if input is empty
  if [[ -z "$input" ]]; then
    echo -e "${RED}Error: Path cannot be empty${NC}" >&2
    return 1
  fi

  # Resolve to absolute path (handles ~, relative paths, symlinks)
  local resolved
  resolved=$(realpath "$input" 2>/dev/null)

  # Check if path exists (if required)
  if [[ "$must_exist" == "true" && ! -e "$resolved" ]]; then
    echo -e "${RED}Error: File or directory not found: $input${NC}" >&2
    return 1
  fi

  # If allowed_base_dir specified, verify path is within it
  if [[ -n "$allowed_base_dir" ]]; then
    local allowed_resolved
    allowed_resolved=$(realpath "$allowed_base_dir" 2>/dev/null)

    if [[ ! "$resolved" =~ ^${allowed_resolved}/.* && "$resolved" != "$allowed_resolved" ]]; then
      echo -e "${RED}Error: Path outside allowed directory${NC}" >&2
      echo -e "${YELLOW}  Input: $input${NC}" >&2
      echo -e "${YELLOW}  Resolved: $resolved${NC}" >&2
      echo -e "${YELLOW}  Allowed: $allowed_resolved${NC}" >&2
      return 1
    fi
  fi

  # Return the safe, resolved path
  echo "$resolved"
  return 0
}

# ============================================================================
# Argument Validation (Whitelist)
# ============================================================================

validate_argument() {
  local input="$1"
  shift
  local allowed_values=("$@")

  # Check if input matches any allowed value
  for allowed in "${allowed_values[@]}"; do
    if [[ "$input" == "$allowed" ]]; then
      echo "$input"
      return 0
    fi
  done

  # Not in whitelist
  echo -e "${RED}Error: Invalid argument: $input${NC}" >&2
  echo -e "${YELLOW}Allowed values: ${allowed_values[*]}${NC}" >&2
  return 1
}

# ============================================================================
# String Sanitization
# ============================================================================

sanitize_string() {
  local input="$1"
  local mode="${2:-filename}" # filename, alphanumeric, path

  case "$mode" in
    filename)
      # Allow only safe filename characters: a-z A-Z 0-9 . _ -
      echo "$input" | tr -cd 'a-zA-Z0-9._-'
      ;;
    alphanumeric)
      # Allow only letters and numbers
      echo "$input" | tr -cd 'a-zA-Z0-9'
      ;;
    path)
      # Allow safe path characters (no command injection)
      echo "$input" | tr -cd 'a-zA-Z0-9/._-'
      ;;
    *)
      echo -e "${RED}Error: Unknown sanitization mode: $mode${NC}" >&2
      return 1
      ;;
  esac
}

# ============================================================================
# Command Validation (Prevent injection)
# ============================================================================

validate_command() {
  local cmd="$1"
  shift
  local allowed_commands=("$@")

  # Extract base command (before first space or argument)
  local base_cmd
  base_cmd=$(echo "$cmd" | awk '{print $1}')

  # Check if command is in whitelist
  for allowed in "${allowed_commands[@]}"; do
    if [[ "$base_cmd" == "$allowed" ]]; then
      return 0
    fi
  done

  echo -e "${RED}Error: Command not allowed: $base_cmd${NC}" >&2
  echo -e "${YELLOW}Allowed commands: ${allowed_commands[*]}${NC}" >&2
  return 1
}

# ============================================================================
# Environment Variable Validation
# ============================================================================

require_env_var() {
  local var_name="$1"
  local usage_hint="${2:-Set with: export $var_name=value}"

  if [[ -z "${!var_name}" ]]; then
    echo -e "${RED}Error: Environment variable not set: $var_name${NC}" >&2
    echo -e "${YELLOW}$usage_hint${NC}" >&2
    return 1
  fi

  return 0
}

# ============================================================================
# API Key Validation
# ============================================================================

validate_api_key() {
  local key="$1"
  local min_length="${2:-16}"

  if [[ -z "$key" ]]; then
    echo -e "${RED}Error: API key cannot be empty${NC}" >&2
    return 1
  fi

  if [[ ${#key} -lt $min_length ]]; then
    echo -e "${RED}Error: API key too short (minimum $min_length characters)${NC}" >&2
    return 1
  fi

  # Check for common test/dummy keys
  local dummy_keys=("test" "dummy" "example" "12345" "dev-key")
  for dummy in "${dummy_keys[@]}"; do
    if [[ "$key" == *"$dummy"* ]]; then
      echo -e "${YELLOW}Warning: API key appears to be a test/dummy key${NC}" >&2
      return 1
    fi
  done

  return 0
}

# ============================================================================
# URL Validation
# ============================================================================

validate_url() {
  local url="$1"
  local allow_external="${2:-false}"

  # Check if URL is empty
  if [[ -z "$url" ]]; then
    echo -e "${RED}Error: URL cannot be empty${NC}" >&2
    return 1
  fi

  # If external URLs not allowed, must be localhost
  if [[ "$allow_external" == "false" ]]; then
    if [[ ! "$url" =~ ^http://localhost || ! "$url" =~ ^http://127\.0\.0\.1 ]]; then
      echo -e "${RED}Error: Only localhost URLs allowed${NC}" >&2
      echo -e "${YELLOW}  URL: $url${NC}" >&2
      return 1
    fi
  fi

  # Basic URL format validation
  if [[ ! "$url" =~ ^https?:// ]]; then
    echo -e "${RED}Error: Invalid URL format (must start with http:// or https://)${NC}" >&2
    return 1
  fi

  return 0
}

# ============================================================================
# Logging (Secure)
# ============================================================================

secure_log() {
  local log_file="$1"
  local message="$2"
  local level="${3:-INFO}"

  # Validate log file path
  local log_dir
  log_dir=$(dirname "$log_file")

  # Create log directory if it doesn't exist
  mkdir -p "$log_dir" 2>/dev/null

  # Write log entry
  local timestamp
  timestamp=$(date '+%Y-%m-%d %H:%M:%S')

  echo "[$timestamp] [$level] $message" >> "$log_file"
}

# ============================================================================
# Usage Examples
# ============================================================================

# Example 1: Validate file path
#   SAFE_PATH=$(validate_path "$USER_INPUT" "/allowed/base/dir")
#   if [[ $? -eq 0 ]]; then
#     cat "$SAFE_PATH"
#   fi

# Example 2: Validate argument from whitelist
#   TARGET=$(validate_argument "$USER_INPUT" "unity" "unreal" "godot")
#   if [[ $? -eq 0 ]]; then
#     export_to_target "$TARGET"
#   fi

# Example 3: Sanitize filename
#   SAFE_NAME=$(sanitize_string "$USER_INPUT" "filename")
#   touch "$SAFE_NAME"

# Example 4: Require environment variable
#   require_env_var "MCP_API_KEY" "Get your key from: https://mcp.example.com/api-keys"
#   if [[ $? -eq 0 ]]; then
#     # Use $MCP_API_KEY safely
#   fi

# Example 5: Validate URL
#   validate_url "$USER_URL" false  # Only localhost allowed
#   if [[ $? -eq 0 ]]; then
#     curl "$USER_URL"
#   fi
