# 浙里文脉 · 文保空间图集

用交互地图探索第一至第八批全国重点文物保护单位的空间分布，聚焦浙江文物、历史年代、杭州高程与浙江河网。

当前公开展示地址：[浙里文脉](https://zheli-wenmai-demo-1031.earlyfawn35.chatgpt.site/)。此仓库提供可独立运行、可部署到 GitHub Pages 的静态网站副本。

## 功能

- 全国概览：省域数量、全国占比、类型筛选、点位与热力分布。
- 浙江文物：城市、文保类型与名称检索。
- 年代演变：14 个历史时期的不同颜色、6 个宽时期分组及动画。
- 杭州高程：按年代、类型、海拔带组合筛选，比较文保点与面积占比。
- 浙江水系：浏览来源数据中的河网缓冲区及对应统计。
- 研究图件：原始成果图、高清图片及年代动画。

“村落与非遗”“周边服务”中的未具备数据项目保留明确的可用性提示。

## 本地运行

安装 Node.js 20 或更新版本，在仓库目录执行：

```sh
node preview.cjs
```

在浏览器打开 `http://127.0.0.1:4173/`。网站读取本地 JSON 数据，请通过这个本地网址访问，而不是直接双击 HTML。

没有 Node.js 时，也可以执行 `python -m http.server 4173 --directory docs`，访问同一网址。

## 检查

```sh
node tools/verify_atlas.cjs
```

检查覆盖：各省与文保类型组合筛选、年代颜色、杭州高程筛选、地图图片、年代播放、点位信息与缓冲区。

## GitHub Pages 发布

1. 将此仓库推送到 GitHub 的公开仓库，默认分支使用 `main`。
2. 打开仓库 **Settings → Pages**。
3. 在 **Build and deployment** 中选择 **Deploy from a branch**。
4. 分支选择 **main**，目录选择 **/docs**，保存。
5. 等待 GitHub 完成发布，使用 Pages 设置中显示的网址访问。

后续修改 `docs/` 中的文件并推送，Pages 会重新发布。项目使用相对路径，可直接放在 `用户名.github.io/仓库名/` 下。无需配置密钥、付费地图接口或构建命令。

## 文件结构

```text
docs/                       网站文件，也是 GitHub Pages 发布目录
  index.html                页面入口
  app.js                    筛选、统计与界面逻辑
  periods.js                历史时期归类与颜色
  map-view.js               SVG 地图绘制
  style.css                 页面样式
  raster-assets.js           内嵌热力与高程显示图
  data/                     网页使用的导出数据
  research-figures/          原始成果图、缩略图和来源清单
tools/verify_atlas.cjs        数据与交互检查
preview.cjs                  本地静态预览
DATA_SOURCES.md              数据口径、来源与局限
LICENSE                     原创网站代码的 MIT 许可证
```

## 统计口径

全国原始点记录为 5,066 条，省域空间统计合计为 5,058 处；浙江点记录为 279 条，省域空间统计为 278 处。它们是不同处理口径，不应直接混用。

杭州共有 47 条研究样本，46 条具有有效高程。浙江年代分类保留原始年代文字，难以可靠归类的记录显示为“待核对”。网页年代分组是一种分析口径，不表示同一遗存仅存在于一个历史时期。

更完整的解释见 [数据来源与局限](DATA_SOURCES.md)。这是课程/研究展示项目，不作为官方名录或法定地图使用。

## 使用与贡献

原创网站代码采用 [MIT 许可证](LICENSE)。数据、行政边界、栅格与研究图片不自动适用 MIT，具体见 [DATA_SOURCES.md](DATA_SOURCES.md)。欢迎通过 Issue 或 Pull Request 提交界面问题、数据校对与改进。
