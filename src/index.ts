import generateBlockNodesTree from "./lib/blockNodesTreeGen"
import generateHtmlFromTree, { traverseTreeToGetLinkRefs } from "./lib/htmlGenerator"

export interface HtmlNode {
	parentNode: HtmlNode;
	nodeName: string;
	textContent?: string;
	closed: boolean;
	children: HtmlNode[];
	indentLevel?: number;
	fenceLength?: number;
	infoString?: string;
	startNo?: string;
	tight?: string;
}

export default function parse(textStream: string, escapeDangerousHtml: boolean) {
	let dangerousHtml:string[] = [];
	if (escapeDangerousHtml) {
		dangerousHtml = ["title", "textarea", "style", "xmp", "iframe", "noembed", "noframes", "script", "plaintext"]
	}
	const root = generateBlockNodesTree(textStream, dangerousHtml);
	const linkRefs = traverseTreeToGetLinkRefs(root);
	const generatedHtml = generateHtmlFromTree(root, 0, linkRefs, dangerousHtml)
	return generatedHtml;
}
