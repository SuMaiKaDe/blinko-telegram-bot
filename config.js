export default {
	telegramToken: "1123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ", // 你的Telegram机器人的Token
	userId: "123456789", // 特定用户的UserID
	apiUrl: "https://blink.baidu.com", // API接口地址
	apiToken: "", // API接口Token
	// 功能开关
	enableAI: false, // 是否启用AI功能（总结功能）
	enableJina: false, // 是否启用Jina阅读器
	// AI配置
	openaiUrl: "https://api.openai.com/v1", // OpenAI API地址
	openaiKey: "", // OpenAI API密钥
	openaiModel: "gpt-3.5-turbo", // OpenAI模型名称
	// Jina Reader配置
	jinaToken: "", // Jina Reader API Token
	jinaKeepImages: false, // 是否保留图片，默认false
};
