export { createMapViewHandler, type MapViewConfig } from './traits/MapViewTrait';
export { createRouteHandler, type RouteConfig, type Waypoint } from './traits/RouteTrait';
export { createPOIHandler, type POIConfig } from './traits/POITrait';
export { createGeocodeHandler, type GeocodeConfig } from './traits/GeocodeTrait';
export { createGeofenceHandler, type GeofenceConfig } from './traits/GeofenceTrait';
export * from './traits/types';

import { createMapViewHandler } from './traits/MapViewTrait';
import { createRouteHandler } from './traits/RouteTrait';
import { createPOIHandler } from './traits/POITrait';
import { createGeocodeHandler } from './traits/GeocodeTrait';
import { createGeofenceHandler } from './traits/GeofenceTrait';

export const pluginMeta = { name: '@holoscript/plugin-geolocation-gis', version: '1.0.0', traits: ['map_view', 'route', 'poi', 'geocode', 'geofence'] };
export const traitHandlers = [createMapViewHandler(), createRouteHandler(), createPOIHandler(), createGeocodeHandler(), createGeofenceHandler()];
