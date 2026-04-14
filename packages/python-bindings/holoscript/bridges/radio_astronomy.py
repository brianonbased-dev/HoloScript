import sys
import json
import math

def calculate_synchrotron(params):
    """
    Mock calculation for synchrotron radiation flux based on magnetic field strength.
    In a fully operational deployment, this would use `astropy.units` and `astropy.constants`.
    """
    b_field = params.get('magnetic_field_gauss', 1e-4) # default interstellar field
    frequency = params.get('frequency_hz', 1.4e9)      # default 1.4 GHz (HI line proximity)
    
    # Placeholder formula for demonstration (proportionality mock)
    # Spectral index alpha ~ 0.75
    flux = (b_field ** 2) * (frequency ** -0.75) * 1e12 
    
    return {
        "flux_density_jy": flux,
        "frequency_hz": frequency,
        "wavelength_meters": 3e8 / frequency
    }

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Insufficient arguments. Usage: script.py <command> <json_params>"}))
        sys.exit(1)

    command = sys.argv[1]
    
    try:
        params = json.loads(sys.argv[2])
    except Exception as e:
        print(json.dumps({"error": f"Invalid JSON payload: {str(e)}"}))
        sys.exit(1)

    if command == "calc_synchrotron":
        result = calculate_synchrotron(params)
    else:
        result = {"error": f"Unknown command: {command}"}

    # Print pure JSON to stdout for the JS bridge to parse
    print(json.dumps(result))

if __name__ == "__main__":
    main()
