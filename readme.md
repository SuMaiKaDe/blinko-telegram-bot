# [blinko](https://github.com/blinko-space/blinko)的 telegram 机器人

## 项目简介

这是一个使用 [Telegraf](https://telegraf.js.org/) 框架和 [Axios](https://axios-http.com/) 库构建的 Telegram 机器人。该机器人可以接收消息，并将消息内容保存到 blinko。

## 功能

- 接收指定用户的文本消息，并将其保存到 API。
- 接收指定用户的文件（如文档、图片等），上传到 API 并保存文件信息。
- 自动回复“收到，正在保存”，并在保存完成后更新为“已保存”或“保存失败”。

# 使用
## 源代码直接使用
1. 克隆仓库或下载项目文件。
2. 安装依赖：

   ```bash
   npm install
   ```

### 配置

在 `config.js` 文件中配置以下参数：

- `telegramToken`: 你的 Telegram 机器人 token。
- `userId`: 指定用户的消息接收 ID。
- `apiToken`: 用于访问 blinko 的 API token。
- `apiUrl`: blinko 的基础 URL。

示例：

```javascript
export default {
	telegramToken: "YOUR_TELEGRAM_BOT_TOKEN",
	userId: "YOUR_USER_ID",
	apiToken: "YOUR_API_TOKEN",
	apiUrl: "https://blink.baidu.com:1111/", //链接在设置里找取api之前
};
```

### 使用

1. 启动机器人：

   ```bash
   nohup node bot.js &
   ```

2. 在 Telegram 中向你的机器人发送消息或文件，机器人会自动处理并保存到你的 blinko 中。

### 日志

日志记录使用 [Winston](https://github.com/winstonjs/winston) 库，错误日志会记录到 `error.log` 文件中。

## docker
有老哥[jonnyan404](https://github.com/Jonnyan404)做了docker
https://hub.docker.com/r/jonnyan404/blinko-tg
## 贡献

欢迎贡献！请提交 Pull Request 或提出 Issue。

## 许可证

代码均由 ai 完成。
