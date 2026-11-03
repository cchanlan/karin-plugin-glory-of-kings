import fs from 'node:fs'
import path from 'node:path'
import { logger } from 'node-karin'
import { PluginName, PluginPath, PluginState, PluginConfig, PluginData, PluginResource, PluginTemp, Path } from '../components/Path.js'

/** 只补缺失文件；旧 git 插件的数据迁入 Karin 持久化目录，不覆盖现有数据。 */
function copyMissing(source,target) {
  if(!fs.existsSync(source))return
  fs.mkdirSync(target,{recursive:true})
  for(const entry of fs.readdirSync(source,{withFileTypes:true})) {
    const from=path.join(source,entry.name),to=path.join(target,entry.name)
    if(entry.isDirectory())copyMissing(from,to)
    else if(entry.isFile()&&!fs.existsSync(to))fs.copyFileSync(from,to)
  }
}
export async function KARIN_PLUGIN_INIT() {
  for(const dir of [PluginState,PluginConfig,PluginData,PluginResource,PluginTemp])fs.mkdirSync(dir,{recursive:true})
  const legacy=path.join(Path,'plugins',PluginName)
  copyMissing(path.join(legacy,'config','config'),PluginConfig)
  copyMissing(path.join(legacy,'data'),PluginData)
  copyMissing(path.join(PluginPath,'config','default_config'),PluginConfig)
  for(const [name,value]of Object.entries({'UserData.yaml':'{}\n','GameRecordPush.yaml':'pushList: {}\n','user_settings.yaml':'{}\n','gameStatsPushSettings.yaml':'{}\n'})) {
    const file=path.join(PluginData,name)
    if(!fs.existsSync(file))fs.writeFileSync(file,value)
  }
  fs.mkdirSync(path.join(PluginData,'user_settings'),{recursive:true})
  logger.info('[王者插件] Karin 原生 npm 插件已初始化')
}
