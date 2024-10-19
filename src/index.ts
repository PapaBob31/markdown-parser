import generateBlockNodesTree from "./lib/blockNodesTreeGen"
import generateHtmlFromTree, { traverseTreeToGetLinkRefs } from "./lib/htmlGenerator"

export interface HtmlNode {
	parentNode: HtmlNode;
	nodeName: string;
	textContent?: string;
	closed: boolean;
	children: HtmlNode[];
	indentLevel?: number; // used to check if a node is nested under another node
	fenceLength?: number; // stores the length of fenced code block boundary
	infoString?: string; // stores node specifis atrributes i.e type of marker a list is using
	startNo?: string; // the start attribute of ordered lists
	tight?: string; // indicates if a List is loose or tight according to the GFM spec
}

export default function parse(textStream: string, escapeDangerousHtml: boolean = true) {
	let dangerousHtml:string[] = [];
	if (escapeDangerousHtml) {
		dangerousHtml = ["title", "textarea", "style", "xmp", "iframe", "noembed", "noframes", "script", "plaintext"]
	}
	const root = generateBlockNodesTree(textStream, dangerousHtml);
	const linkRefs = traverseTreeToGetLinkRefs(root);
	const generatedHtml = generateHtmlFromTree(root, 0, linkRefs, dangerousHtml)
	return generatedHtml;
}

/* Things you might warn user about in case you add error logging 
Excess Table rows
Invalid html entities
inline tags wrapping around single non-void tags

Add variables?

*/
