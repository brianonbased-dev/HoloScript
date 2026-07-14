# @holoscript/robotics-plugin

Robotics plugin for HoloScript compile-time USD/URDF generation and ROS2/Gazebo
integration surfaces.

## Public Consumption

```js
import { Parser, USDCodeGen, extractURDFFromHoloComposition } from '@holoscript/robotics-plugin';
```

The package root ships built JavaScript and declaration files. It does not
expose TypeScript source as the public runtime entry.
