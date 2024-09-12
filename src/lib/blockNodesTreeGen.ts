import type {HtmlNode} from "../index"
import { getBlockNodes, getInnerMostOpenContainer, getValidOpenedAncestor, closeNode, checkIfPartOfOtherNodeTypes} from "./treeConstructUtils"

function getHeaderNodeObj(line: string, lastOpenedNode: HtmlNode): HtmlNode {
	let headerDetails = line.match(/(\s*)(#+)\s/) as RegExpMatchArray;
	let ph = headerDetails[1].length;
	let hl = headerDetails[2].length;
	if (hl > 6)
		return {parentNode: lastOpenedNode, nodeName: "paragraph", closed: false, textContent: line, children: []};
	return {parentNode: lastOpenedNode, nodeName: `h${hl}`, closed: true, textContent: line.slice(hl + ph), children: []}
}

function addLeafBlocksContent(lastOpenedNode: HtmlNode, nodeName: string, line: string, htmlBlockType: string) {
	if (nodeName === "header") {
		lastOpenedNode.children.push(getHeaderNodeObj(line, lastOpenedNode))
	}else if (nodeName === "hr") {
		lastOpenedNode.children.push({parentNode: lastOpenedNode, closed: true, nodeName, children: []})
	}else if (nodeName === "html block") {
		lastOpenedNode.children.push(
			{parentNode: lastOpenedNode, nodeName: "html block", closed: false, textContent: line, infoString: htmlBlockType, children: []}
		)
		const newNode = lastOpenedNode.children[lastOpenedNode.children.length - 1];
		if (newNode.infoString !== "6" && detectEndOfHtmlBlock(newNode.infoString, line)) {
			newNode.closed = true;
		}
	}else if (nodeName === "plain text") {
		lastOpenedNode.children.push({parentNode: lastOpenedNode, nodeName: "paragraph", closed: false, textContent: line, children: []})
	}else if (nodeName === "indented code block") {
		lastOpenedNode.children.push(
			{parentNode: lastOpenedNode, nodeName: "indented code block", closed: false, textContent: line, children: []}
		)
	}
}

function detectEndOfHtmlBlock(blockType: string, line: string) {
	switch (blockType) {
		case "1": // html comments
			return line.includes("-->")
		case "2":
			return line.includes("?>")
		case "5": // script, pre and style tags
			return (/<(?:\/script>)|(?:\/pre>)|(?:\/style>)/).test(line);
		case "3": // CDATA
			return line.includes("]]>")
		case "4": // declarartion types e.g <!DOCTYPE html>
			return line.includes(">")
	}
	return false;
}

function getHtmlBlockType(line: string) {
	let newNode: HtmlNode;
	let htmlPatterns = line.match(/\s*(<!--)(?!(?:>|->))/) || line.match(/<([^<\s>][^]*)/); // need better regex
	let escapeDangerousHtml = true;
	let dangerousHtml = ["title", "textarea", "style", "xmp", "iframe", "noembed", "noframes", "script", "plaintext"]
	if (!htmlPatterns) {
		return null
	}else if (escapeDangerousHtml && dangerousHtml.includes(htmlPatterns[1])) {
		return null
	}
	if (htmlPatterns[1] === "<!--") {
		return "1"
	}else {
		if (htmlPatterns[1].slice(0, 2) === "<?") {
			return "2"
		}else if (htmlPatterns[1].slice(0, 8) === "![CDATA[") {
			return "3"
		}else if (htmlPatterns[1].slice(0, 2) === "!") {
			return "4"
		}else if (["script", "pre", "style"].includes(htmlPatterns[1].toLowerCase())) {
			return "5"
		}else {
			return "6"
		}
	}
}

// TODO: implementfeature that allows block leaves to interrupt each other correctly
function continueLeafBlocks(lastOpenedNode: HtmlNode, line: string, markerPos: number, nodeName: string):void {
	let lastOpenedContainer = getInnerMostOpenContainer(lastOpenedNode)
	let multilineLeafBlocks = ["html block", "paragraph", "fenced code", "indented code block"]	

	let htmlBlockType = "";
	if (lastOpenedContainer.nodeName !== "html block" && nodeName === "html block"){
		htmlBlockType = getHtmlBlockType(line.slice(markerPos))
		if (!htmlBlockType) {
			nodeName = "plain text";
		}
	}
	

	if (nodeName === "fenced code" || lastOpenedContainer.nodeName === "fenced code") {
		addFencedCodeContent(lastOpenedNode, line)	
	}else if (!multilineLeafBlocks.includes(lastOpenedContainer.nodeName)){
		addLeafBlocksContent(lastOpenedContainer, nodeName, line, htmlBlockType)
	}else if (lastOpenedContainer.nodeName === "paragraph" && nodeName !== "plain text"){
		addLeafBlocksContent(lastOpenedContainer.parentNode, nodeName, line, htmlBlockType)
	}else {
		if (lastOpenedContainer.nodeName === "html block" && lastOpenedContainer.infoString !== "6") {
			if (detectEndOfHtmlBlock(lastOpenedContainer.infoString, line)){
				lastOpenedContainer.closed = true
			}
		}
		lastOpenedContainer.textContent += '\n' + line
	}
}

function addFencedCodeContent(lastOpenedNode: HtmlNode, line: string){
	let lastChild = lastOpenedNode.children[lastOpenedNode.children.length - 1];
	let fenceDetails = line.match(/(`+)(.+)?/) as RegExpMatchArray;

	if (fenceDetails) {
		let fenceLength = fenceDetails[1].length
		if (!lastChild || lastChild.nodeName !== "fenced code") {
			let infoString = (fenceDetails[2] || "");
			lastOpenedNode.children.push(
				{parentNode: lastOpenedNode, nodeName: "fenced code", fenceLength, closed: false, textContent: "", infoString, children: []}
			)
		}else if (((lastChild.fenceLength as number) <= fenceLength) && !fenceDetails[2]) {
			lastChild.closed = true;
		}else lastChild.textContent += '\n' + line;
	}else {
		lastChild.textContent += '\n' + line;
	}
}

// TODO: thoroughly examint the indentlevel set to avoid off by one errors
function addListItem(nodeName: string, lastOpenedNode: HtmlNode, line: string, markerPos: number) {
	let parentNodeName = ""; // list parent node name as in ordered or unordered
	if (nodeName === "ol-li") {
		parentNodeName = "ol"
	}else parentNodeName = "ul"

	let markerWidth;
	let listItemPattern = line.match(/(\s*)(\d{1,9}(\.|\)))(\s*)/) || line.match(/(\s*)(\*|\+|-)(\s*)/) as RegExpMatchArray;
	if (listItemPattern[3].length >= 4) {
		markerWidth = listItemPattern[2].length + 1;
	}else markerWidth = listItemPattern[2].length + listItemPattern[3].length;

	let lastChild = lastOpenedNode.children[lastOpenedNode.children.length - 1];
	if (!lastChild || lastChild.nodeName !== parentNodeName) {
		let startNo = (parentNodeName === "ol" ? listItemPattern[2] : "");
		lastOpenedNode.children.push({parentNode: lastOpenedNode, nodeName: parentNodeName, closed: false, startNo, children: []})
		lastChild = lastOpenedNode.children[lastOpenedNode.children.length - 1];
	}
	// indent level should temporarily be zero for text on the same line as the list marker to prevent wrong indent usage
	lastChild.children.push({parentNode: lastChild, nodeName: "li", indentLevel: 0, closed: false, children: []})
	lastOpenedNode = lastChild.children[lastChild.children.length - 1];

	let openedNestedNode:HtmlNode = parseLine(line.slice(markerPos + markerWidth), lastOpenedNode);
	lastOpenedNode.indentLevel = markerPos + markerWidth; // actual indent level to be used for nested nodes
	if (lastOpenedNode !== openedNestedNode) {
		lastOpenedNode = openedNestedNode;
	}
	return lastOpenedNode;
}

function getInnerMostOpenBlockQuote(node:HtmlNode):HtmlNode|null {
	let blockQuoteNode = null;
	if (node.closed) {
		return null
	}else if (node.nodeName === "blockquote") {
		blockQuoteNode = node
	}

	if (node.children.length === 0) {
		return blockQuoteNode
	}
	let temp = getInnerMostOpenBlockQuote(node.children[node.children.length-1])
	if (temp) {
		blockQuoteNode = temp;
	}
	return blockQuoteNode;
}

// TODO: backslash escapes, proper tab to spaces conversion, escape dangerous html
// Also handle markers that seems to be indented too far but they are just nested under a list item
function parseLine(line: string, lastOpenedNode: HtmlNode) {
	if (line.search(/\S/) === -1) {
		if (lastOpenedNode.nodeName === "li" && lastOpenedNode.indentLevel !== 0 && lastOpenedNode.children.length === 0) {
			// List item starts with more than one nested blank line. close it
			lastOpenedNode.closed = true
			lastOpenedNode = getValidOpenedAncestor(lastOpenedNode.parentNode, lastOpenedNode.indentLevel);
		}else {
			let aNodeWasClosed = closeNode(lastOpenedNode);
			if (aNodeWasClosed) {
				return lastOpenedNode
			}
		}
	}

	let [nodeName, markerPos] = getBlockNodes(line);

	let lastOpenedContainer = getInnerMostOpenContainer(lastOpenedNode)
	if (nodeName !== "plain text" || lastOpenedContainer.nodeName !== "paragraph") {
		// to allow for paragraph continuation lines
		lastOpenedNode = getValidOpenedAncestor(lastOpenedNode, markerPos);
		lastOpenedContainer = getInnerMostOpenContainer(lastOpenedNode)
	}

	let multilineLeafBlocks = ["html block", "paragraph", "fenced code", "indented code block"];
	if (markerPos - lastOpenedNode.indentLevel > 3) {
		if (!multilineLeafBlocks.includes(lastOpenedContainer.nodeName)) {
			nodeName = "indented code block";
		}else {
			nodeName = "plain text";
		}
	}

	if (["html block", "fenced code"].includes(lastOpenedContainer.nodeName)) {
		continueLeafBlocks(lastOpenedNode, line, markerPos, "plain text");
	}else if (!["ol-li", "ul-li", "blockquote"].includes(nodeName)) {
		continueLeafBlocks(lastOpenedNode, line, markerPos, nodeName);
	}else if (nodeName === "blockquote") {
		let openedBlockQuote = null;
		if (line.slice(markerPos+1,4).indexOf('>') == -1) {
			openedBlockQuote = getInnerMostOpenBlockQuote(lastOpenedNode);
		}else {
			openedBlockQuote = lastOpenedNode.children[lastOpenedNode.children.length-1]
		}

		if (!openedBlockQuote || openedBlockQuote.nodeName !== "blockquote" || openedBlockQuote.closed) {
			lastOpenedNode.children.push(
				{parentNode: lastOpenedNode, nodeName: "blockquote", closed: false, indentLevel: lastOpenedNode.indentLevel+markerPos+1, children: []}
			)
			openedBlockQuote = lastOpenedNode.children[lastOpenedNode.children.length - 1]
		}
		let actualIndentLevel = openedBlockQuote.indentLevel
		openedBlockQuote.nodeName = "main"; // makes every nested node actually believe it's root
		openedBlockQuote.indentLevel = 0; // makes every nested node actually believe it's root

		parseLine(line.slice(markerPos+1), openedBlockQuote);

		openedBlockQuote.nodeName = "blockquote"; // restore to actual value
		openedBlockQuote.indentLevel = actualIndentLevel; // restore to actual value
		
	}else if (nodeName === "ol-li" || nodeName === "ul-li") {
		lastOpenedNode = addListItem(nodeName, lastOpenedNode, line, markerPos)
	}
	return lastOpenedNode;
}

export default function generateBlockNodesTree(textStream: string) {
	let rootNode:HtmlNode = {parentNode: null as any, nodeName: "main", indentLevel: 0, closed: false, children: []};
	let lastOpenedNode = rootNode;
	const lines = textStream.split('\n');

	for (let line of lines) {
		lastOpenedNode = parseLine(line, lastOpenedNode);
	}

	return rootNode;
}