import { Telegraf } from "telegraf";
import axios from "axios";
import FormData from "form-data";
import config from "./config.js";
import winston from "winston";
import { toMyMarkdown } from "./tomd.js";

// 创建日志记录器
const logger = winston.createLogger({
	level: "info",
	format: winston.format.json(),
	defaultMeta: { service: "telegram-bot" },
	transports: [
		new winston.transports.Console(),
		new winston.transports.File({ filename: "error.log", level: "error" }),
	],
});

// 创建 Telegraf 实例
const bot = new Telegraf(config.telegramToken);

// 监听消息
bot.on("message", async (ctx) => {
	try {
		const userId = parseInt(config.userId);

		// 检查消息是否来自指定用户
		if (ctx.message.from.id === userId) {
			const markdownText = toMyMarkdown(ctx.message);
			let content = ctx.message.text
				? ctx.message.text
				: markdownText
				? markdownText
				: null;
			let attachments = [];

			// 发送“收到，正在保存”消息
			const savingMessage = await ctx.reply("收到，正在保存", {
				reply_to_message_id: ctx.message.message_id,
			});

			// 检查是否有文件
			if (ctx.message.document || ctx.message.photo) {
				const fileId = ctx.message.document
					? ctx.message.document.file_id
					: ctx.message.photo[ctx.message.photo.length - 1].file_id;
				const fileUrl = await getFileLink(ctx, fileId);
				let fileinfo = {
					filename: ctx.message.document?.file_name || "file",
				};
				const fileResponse = await uploadFile(fileUrl, fileinfo);

				if (fileResponse.status === 200) {
					const { filePath: path, fileName: name, type, size } = fileResponse;
					attachments.push({ path, name, type, size });
				}
			}

			// 发送消息到 API
			const saveResult = await sendToApi(content, attachments);
			// 修改消息为“已保存”或“保存失败”
			if (saveResult.id) {
				await ctx.telegram.editMessageText(
					ctx.chat.id,
					savingMessage.message_id,
					null,
					"已保存"
				);
			} else {
				await ctx.telegram.editMessageText(
					ctx.chat.id,
					savingMessage.message_id,
					null,
					"保存失败"
				);
			}
		}
	} catch (error) {
		logger.error("An error occurred:", error);
		await ctx.reply("发生错误，请稍后再试");
	}
});

// 获取文件链接
async function getFileLink(ctx, fileId) {
	try {
		const file = await ctx.telegram.getFile(fileId);
		return `https://api.telegram.org/file/bot${config.telegramToken}/${file.file_path}`;
	} catch (error) {
		logger.error("Error getting file link:", error);
		throw error;
	}
}

// 上传文件到 API
async function uploadFile(fileUrl, fileinfo) {
	try {
		console.log("fileurl:" + fileUrl);
		const response = await axios.get(fileUrl, { responseType: "stream" });
		const fileStream = response.data;
		const formData = new FormData();
		formData.append("file", fileStream, { filename: fileinfo.filename });

		const uploadResponse = await axios.post(
			`${config.apiUrl}/api/file/upload`,
			formData,
			{
				headers: { Authorization: `Bearer ${config.apiToken}` },
			}
		);

		return uploadResponse.data;
	} catch (error) {
		logger.error("Error uploading file:", error);
		throw error;
	}
}

// 发送消息到 Blinko API
async function sendToApi(content, attachments) {
	try {
		const payload = {
			content,
			type: 0,
			attachments,
		};

		const response = await axios.post(
			`${config.apiUrl}/api/v1/note/upsert`,
			payload,
			{
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${config.apiToken}"`,
				},
			}
		);

		return response.data;
	} catch (error) {
		logger.error("Error sending to API:", error);
		throw error;
	}
}

bot.launch();
