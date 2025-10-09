import generateBlockNodesTree from "./lib/blockNodesTreeGen"
import generateHtmlFromTree, { updateLinkRefsMap } from "./lib/htmlGenerator"

export interface HtmlNode {
	parentNode: HtmlNode;
	nodeName: string;
	textContent?: string;
	closed: boolean;
	children: HtmlNode[];
	indentLevel?: number; // Index where content must at least start from before it can count as this node's child. particularly useful for list item nodes
	fenceLength?: number; // Used by fenced code block nodes. Stores the length of fenced code block boundary
	infoString?: string; // stores node specific atrributes e.g type of marker a list is using, html block type
	startNo?: string; // the start attribute of ordered list nodes
	tight?: string; // indicates if a List is loose or tight according to the Common Mark spec
}

export interface LinkRefData {
	label: string;
	destination: string;
	title: string
}

export interface LinkRefDataMap {
	[normalisedLabel:string]: LinkRefData
}


export default function parse(textStream: string, escapeDangerousHtml: boolean = true) {
	let dangerousHtml:string[] = [];
	const linkRefsMap: LinkRefDataMap = {};

	if (escapeDangerousHtml) {
		dangerousHtml = ["title", "textarea", "style", "xmp", "iframe", "noembed", "noframes", "script", "plaintext"]
	}
	const root = generateBlockNodesTree(textStream, linkRefsMap, dangerousHtml);
	updateLinkRefsMap(root, linkRefsMap);
	const generatedHtml = generateHtmlFromTree(root, 0, linkRefsMap, dangerousHtml)
	return generatedHtml;
}
