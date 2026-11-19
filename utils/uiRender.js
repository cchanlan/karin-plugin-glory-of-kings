import { render } from 'node-karin'
import { Config, PluginPath } from '../components/index.js'
import { buildThemeStyle } from '../components/RenderTheme.js'

/** 保留 Karin 原生 render.render 接口，不引入云崽渲染依赖。 */
export default {
  render (options, ...args) {
    return render.render({
      ...options,
      data: {
        ...options.data,
        _gokUiStyle: buildThemeStyle(Config.getDefOrConfig('config'), PluginPath)
      }
    }, ...args)
  }
}
