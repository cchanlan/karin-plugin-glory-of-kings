// 已在 Linux 的 Node 18/24、Karin 1.17/1.18 实测；Windows 使用官方路径 API，尚未实跑。
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { karinPathBase, karinPathRoot, karinPathTemp } from 'node-karin/root';
const Path = karinPathRoot;
const PluginName = 'karin-plugin-glory-of-kings';
const PluginPath = path.resolve(fileURLToPath(import.meta.url), '../..');
const PluginState = path.join(karinPathBase, PluginName);
const PluginConfig = path.join(PluginState, 'config');
const PluginData = path.join(PluginState, 'data');
const PluginResource = path.join(PluginState, 'resources');
const PluginTemp = path.join(karinPathTemp, PluginName);
const ResourcePath = path.join(PluginPath, 'resources');
const ResourceUrl = pathToFileURL(ResourcePath + path.sep).href;
export { Path, PluginName, PluginPath, PluginState, PluginConfig, PluginData, PluginResource, PluginTemp, ResourcePath, ResourceUrl };
