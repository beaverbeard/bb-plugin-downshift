import {definePluginApp} from '@get-bb/plugin-sdk/app';
import {registerDownshiftMode} from './control';
export default definePluginApp(app => {registerDownshiftMode(app);});
