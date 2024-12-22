import { serialiseWith, escapers } from "@telegraf/entity";

// 自定义 Markdown 序列化器
const myMarkdownSerialiser = (match, node) => {
	// 在这里实现你自己的 Markdown 序列化逻辑
	switch (node?.type) {
		case "bold":
			return `**${match}**`;
		case "italic":
			return `_${match}_`;
		case "underline":
			return `__${match}__`;
		case "strikethrough":
			return `~~${match}~~`;
		case "code":
			return `\`${match}\``;
		case "pre":
			if (node.language) return "```" + node.language + "\n" + match + "\n```";
			return "```\n" + match + "\n```";
		case "spoiler":
			return `||${match}||`;
		case "url":
			return `[${match}](${node.url})`;
		case "text_link":
			return `[${match}](${node.url})`;
		case "text_mention":
			return `[${match}](tg://user?id=${node.user.id})`;
		case "blockquote":
			return `>${match.split("\n").join("\n>")}`;
		case "mention":
		case "custom_emoji":
		case "hashtag":
		case "cashtag":
		case "bot_command":
		case "phone_number":
		case "email":
		default:
			return match;
	}
};

// 使用自定义序列化器和内置的 Markdown 转义器

const serialise = serialiseWith(myMarkdownSerialiser, escapers.MarkdownV2);

// 导出自定义的 Markdown 序列化函数
export const toMyMarkdown = (msg) => {
	return serialise(msg);
};
