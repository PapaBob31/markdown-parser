import type { HtmlNode } from "../index"
import parseInlineNodes from "./inlineNodesParser"

export interface LinkRef {
	label: string;
	destination: string;
	title: string
}


function getLinkReferenceDefs(text: string) { // TODO: search and replace all escaped characters with regex
	const linkData = text.match(/^\s*\[([^]+)\]:\s*((?:<.*>)|(?:\S+))\s*((?:"|'|\()[^]+)?\s*$/);
	const linkRefDef = {label: "", destination: "", title: ""};

	if (!linkData || linkData[1].length > 999) {
		return null
	}else {
		linkRefDef.label = linkData[1];
		linkRefDef.destination = linkData[2];
	}

	if (linkData && !linkData[3]){
		return linkRefDef
	}

	if (linkData && linkData[3]){
		if (linkData[3].includes("\n\n") || (linkData[3][0] !== linkData[3][linkData[3].length-1])) {
			// first condition is maybe a crude way of checking if the text contains blank lines
			return null
		}else linkRefDef.title = linkData[3].slice(1, linkData[3].length-1);
	}

	return linkRefDef
}

export function traverseTreeToGetLinkRefs(rootNode: HtmlNode) {
	let refs: LinkRef[] = [];

	if (rootNode.children && rootNode.children.length > 0) {
		for (let i=0; i<rootNode.children.length; i++) {
			let childNode = rootNode.children[i];
			if (["blockquote", "ul", "ol", "li"].includes(childNode.nodeName)){
				refs.concat(traverseTreeToGetLinkRefs(childNode));
				continue
			}
			if (childNode.nodeName !== "paragraph") {
				continue;
			}
			let linkReference = getLinkReferenceDefs(childNode.textContent as string);
			if (linkReference) {
				refs.push(linkReference);
				rootNode.children[i].textContent = ""; // since it contains link reference definitions
			}
		}
	}
	return refs;
}

function formattedString() {

}

// TODO: don't wrap tight lists paragraphs with p tags, process backslash escapes 
export default function generateHtmlFromTree(rootNode: HtmlNode, indentLevel: number, linkRefs: LinkRef[], dangerousHtmlTags:string[]):string {
	let text = "";
	const whiteSpace = ' '.repeat(indentLevel);
	if (rootNode.nodeName === "paragraph" || (/h[1-6]/).test(rootNode.nodeName)) {
		rootNode.textContent = parseInlineNodes(rootNode.textContent as string, linkRefs, dangerousHtmlTags);
	}
	if (rootNode.nodeName === "html block") {
		text = `${whiteSpace}${rootNode.textContent}\n`
	}else if (rootNode.nodeName === "paragraph") {
		text = rootNode.textContent ? `${whiteSpace}<p>${rootNode.textContent}</p>\n` : ""// TODO: Don't nest inside paragraphs if content is only comment
	}else if ((/h[1-6]/).test(rootNode.nodeName)) {
		const tag = rootNode.nodeName;
		text = `${whiteSpace}<${tag}>${rootNode.textContent}</${tag}>\n`
	}else if (rootNode.nodeName === "fenced code" || rootNode.nodeName === "indented code block") {
		text = `${whiteSpace}<pre class="${rootNode.infoString || ""}">\n${whiteSpace+'  '}<code>${rootNode.textContent}\n${whiteSpace+'  '}</code>\n${whiteSpace}</pre>\n`
	}else if (["hr"].includes(rootNode.nodeName)) {
		text = `${whiteSpace}<${rootNode.nodeName}>\n`
	}else {
		if (rootNode.nodeName === "ol") {
			text = `${whiteSpace}<${rootNode.nodeName} start="${rootNode.startNo}">\n`	
		}else text = `${whiteSpace}<${rootNode.nodeName}>\n`;

		if (rootNode.children.length === 1) {
			let onlyChild = rootNode.children[rootNode.children.length-1];
			text += `${generateHtmlFromTree(onlyChild, indentLevel+2, linkRefs, dangerousHtmlTags)}`;
		}else if (rootNode.children.length >= 1){
			for (const childNode of rootNode.children) {
				text += `${generateHtmlFromTree(childNode, indentLevel+2, linkRefs, dangerousHtmlTags)}`;
			}
		}else if (rootNode.textContent)
			text += `${whiteSpace + '  '}${rootNode.textContent}`;
		text += `${whiteSpace}</${rootNode.nodeName}>\n`
	}
	return text;
}

