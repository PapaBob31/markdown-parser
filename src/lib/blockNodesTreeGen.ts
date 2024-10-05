import type {HtmlNode} from "../index"
import { getLineSemantics, getInnerMostOpenContainer, getValidOpenedAncestor, getFirstClosableChildNode} from "./treeConstructUtils"
import {getHtmlTagEndPos} from "./inlineNodesParser"

/** returns a node representing an html header element or 
 * paragraph depending on the content of the `line` parameter */
function getHeaderNodeObj(line: string, lastOpenedNode: HtmlNode): HtmlNode {
	let headerDetails = line.match(/(\s*)(#+)\s/) as RegExpMatchArray;
	let ph = headerDetails[1].length;
	let hl = headerDetails[2].length;
	if (hl > 6)
		return {parentNode: lastOpenedNode, nodeName: "paragraph", closed: false, textContent: line, children: []};
	return {parentNode: lastOpenedNode, nodeName: `h${hl}`, closed: true, textContent: line.slice(hl + ph).trimLeft(), children: []}
}

// Adds a node representing an html leaf block (as per gfm spec) to the document tree
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
		if (newNode.infoString !== "6" && htmlBlockEnded(newNode.infoString, line)) {
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

// Checks if a line that's part of an html block node ends the node's content
function htmlBlockEnded(blockType: string, line: string) {
	switch (blockType) {
		case "1": // html comments
			return line.includes("-->")
		case "2":
			return line.includes("?>")
		case "3": // CDATA
			return line.includes("]]>")
		case "4": // declarartion types e.g <!DOCTYPE html>
			return line.includes(">")
		case "5": // script, pre and style tags
			return (/<(?:\/script>)|(?:\/pre>)|(?:\/style>)/i).test(line);
	}
	return false;
}

let dangerousHtmlTags: string[] = []

/** The GFM spec defines 7 types of html block
 * Returns the type of html block that the line parameter starts */ 
function getHtmlBlockType(line: string) {
	let newNode: HtmlNode;
	let htmlPatterns = line.match(/\s*(<!--)(?!(?:>|->))/) || line.match(/<([^<\s>][^\s>]*)/);
	let type6Tags = ["address", "article", "aside", "base", "basefont", "blockquote", "body", "caption", 
					"center", "col", "colgroup", "dd", "details", "dialog", "dir", "div", "dl", "dt", "fieldset", 
					"figcaption", "figure", "footer", "form", "frame", "frameset", "h1", "h2", "h3", "h4", "h5", 
					"h6", "head", "header", "hr", "html", "iframe", "legend", "li", "link", "main", "menu", 
					"menuitem", "nav", "noframes", "ol", "optgroup", "option", "p", "param", "section", "source", 
					"summary", "table", "tbody", "td", "tfoot", "th", "thead", "title", "tr", "track", "ul",]
	if (!htmlPatterns) {
		return null
	}else if (dangerousHtmlTags.includes(htmlPatterns[1].toLowerCase())) {
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
		}else if (type6Tags.includes(htmlPatterns[1].toLowerCase())) {
			return "6"
		}else if (getHtmlTagEndPos(line.indexOf('<'), line, dangerousHtmlTags) !== -1) {
			return "7"
		}else return null
	}
}

// Adds a new Html leaf blcok node to the tree or updates an existing one
function continueLeafBlocks(lastOpenedNode: HtmlNode, line: string, markerPos: number, nodeName: string):void {
	let lastOpenedContainer = getInnerMostOpenContainer(lastOpenedNode)
	let multilineLeafBlocks = ["html block", "paragraph", "fenced code", "indented code block"]

	let htmlBlockType = "";
	if (lastOpenedContainer.nodeName !== "html block" && nodeName === "html block"){
		htmlBlockType = getHtmlBlockType(line.slice(markerPos)) // more thorough check to know which type of html block it is
		if (!htmlBlockType) {
			nodeName = "plain text";
		}
	}else if (nodeName === "indented code block") {
		line = line.slice(markerPos-3); // remove leading whitespace used to mark the line as part of indented code block
	}

	if (nodeName === "fenced code" || lastOpenedContainer.nodeName === "fenced code") {
		// unclosed fenced code blocks override the creation of new child nodes in it's parent
		addFencedCodeContent(lastOpenedNode, line)	
	}else if (!multilineLeafBlocks.includes(lastOpenedContainer.nodeName)){ // a new leaf block node will be created
		addLeafBlocksContent(lastOpenedContainer, nodeName, line, htmlBlockType)
	}else if (lastOpenedContainer.nodeName === "paragraph" && nodeName !== "plain text"){ // a new leaf block node will be created
		addLeafBlocksContent(lastOpenedContainer.parentNode, nodeName, line, htmlBlockType)
	}else {
		if (lastOpenedContainer.nodeName === "html block" && !(["6", "7"]).includes(lastOpenedContainer.infoString)) {
			if (htmlBlockEnded(lastOpenedContainer.infoString, line)){
				lastOpenedContainer.closed = true
			}
		}
		if (lastOpenedContainer.nodeName === "indented code block")
			line = line.slice(markerPos-3); // remove leading whitespace used to mark the line as part of indented code block
		lastOpenedContainer.textContent += '\n' + line // continue wahtever leaf block was opened
	}
}

// Adds a new fenced code block node to the document tree or updates an existing one in the tree
function addFencedCodeContent(lastOpenedNode: HtmlNode, line: string){
	let lastChild = lastOpenedNode.children[lastOpenedNode.children.length - 1];
	let fenceDetails = line.match(/(`+)(.+)?/) as RegExpMatchArray; // the delimiter for the fenced code block

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

function getMarkerType(markerString: string) {
	switch(markerString) {
		case '+':
			return "+ marker"
		case '-':
			return "- marker"
		case '*':
			return "* marker"
		default:
			if ((/\d+\./).test(markerString))
				return "num. marker"
			else
				return "num) marker"
	}
}

// TODO: thoroughly examine the indentlevel set to avoid off by one errors
function addListItem(nodeName: string, lastOpenedNode: HtmlNode, line: string, markerPos: number) {
	let parentNodeName = ""; // list parent node name as in ordered or unordered
	if (nodeName === "ol-li") {
		parentNodeName = "ol"
	}else parentNodeName = "ul"

	let markerWidth, markerPattern;
	let listItemPattern = line.match(/(\s*)(\d{1,9}(?:\.|\)))(\s*)/) || line.match(/(\s*)(\*|\+|-)(\s*)/) as RegExpMatchArray;
	if (listItemPattern[3].length >= 4) {
		markerWidth = listItemPattern[2].length + 1;
	}else markerWidth = listItemPattern[2].length + listItemPattern[3].length;
	markerPattern = getMarkerType(listItemPattern[2]);

	let lastChild = lastOpenedNode.children[lastOpenedNode.children.length - 1]; // potential list node
	if (!lastChild || lastChild.nodeName !== parentNodeName || lastChild.infoString !== markerPattern) {
		let startNo = (parentNodeName === "ol" ? listItemPattern[2].match(/[^.)]+/)[0] : "");
		lastOpenedNode.children.push(
			{parentNode: lastOpenedNode, nodeName: parentNodeName, closed: false, startNo, infoString: markerPattern, tight: "true", children: []}
		)
		lastChild = lastOpenedNode.children[lastOpenedNode.children.length - 1];
	}
	// The list item indent level set localises mutations of nodes to below the list item node 
	// when parsing the remaining content of the line conatining the list marker incase there are other block contents on the same line
	lastChild.children.push({parentNode: lastChild, nodeName: "li", indentLevel: 0, closed: false, children: []})
	lastOpenedNode = lastChild.children[lastChild.children.length - 1];

	// parse the content of the line apart from the marker incase of nested block nodes
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

// set the parentNode of the listItem parameter as a loose list
// if it satisfies the conditions of a loose list 
function changeListIfLoose(listItem: HtmlNode) {
	const listNode = listItem.parentNode
	if (listNode.tight === "false")
		return
	if (listItem.children.length > 1 && listItem.children[0].closed){ // check closed attribute for blank line between 2 blocks
		listNode.tight = "false"
	}else if (listNode.tight === "maybe" && listNode.children.length > 1) {
		listNode.tight = "false"
	}else {
		return;
	}
}

/** Performs a node-type specific effect on the lastOpenedNode parameter if the line parameter
 *  contains only white space. Returns an HtmlNode or null depending on the effect that occured  */
function processBlankLine(line: string, lastOpenedNode: HtmlNode) {
	if (line.search(/\S/) !== -1)
		return null;

	if (lastOpenedNode.nodeName === "li" && lastOpenedNode.indentLevel === 0) {
		/* The `line` being parsed is on the same line as the list item's marker.
		   This type of blank line alone has no effect on a list item or it's parent list */
		return lastOpenedNode;
	}

	if (lastOpenedNode.nodeName === "li" && lastOpenedNode.parentNode.tight === "true") { // parent list is tight
		lastOpenedNode.parentNode.tight = "maybe"
	}

	if (lastOpenedNode.nodeName === "li" && lastOpenedNode.children.length === 0) {
		// List item starts with more than one nested blank line. close it (as per GFM spec)
		lastOpenedNode.closed = true
		lastOpenedNode = getValidOpenedAncestor(lastOpenedNode.parentNode, lastOpenedNode.indentLevel);
		return lastOpenedNode;
	}else {
		let firstOpenedChild = getFirstClosableChildNode(lastOpenedNode);
		if (firstOpenedChild && firstOpenedChild !== lastOpenedNode) {
			firstOpenedChild.closed = true;
		}
		if (firstOpenedChild) { // firstOpenedChild is closable i.e not a type 1-5 html block
			return lastOpenedNode;
		}
	}
	return null;
}

function addOrUpdateBlockQuote(line: string, markerPos: number, lastOpenedNode: HtmlNode) {
	let openedBlockQuote = null;
	if (line.slice(markerPos+1, markerPos+5).indexOf('>') == -1) {
		/* content of subsequent lines That are meant to be part of a single parent blockquote
		   should be the continuation of the innermost nested blockquote */
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

	// makes every nested node actually believe it's root. This allows mutations to be localised below the node
	openedBlockQuote.nodeName = "root";
	openedBlockQuote.indentLevel = 0;

	// incase the line's content has other nested block nodes that will be nested in the blockquote
	parseLine(line.slice(markerPos+1), openedBlockQuote);

	openedBlockQuote.nodeName = "blockquote"; // restore to actual value
	openedBlockQuote.indentLevel = actualIndentLevel; // restore to actual value
}


function nodeIsAParagraph(node: HtmlNode) {
	let parent = node.parentNode
	if (node.nodeName === "paragraph" && parent.nodeName !== "li") {
		return true
	}else if (node.nodeName === "paragraph" && parent.parentNode.tight === "false") { // only paragraphs inside loose lists are considered paragraphs
		return true
	}
	return false
}

// Returns the correct meaning of a marker based on the content it was found in and the last unclosed node.
function getActualMeaning(content: string, markerMeaning: string, lastUnclosedNode: HtmlNode, couldStartIndentedCode: boolean){
	if ((markerMeaning === "ol-li" || markerMeaning === "ul-li") && nodeIsAParagraph(lastUnclosedNode)) {
		if (!(/^\s*1\./).test(content)) { // only lists with markers of format '1.' can interrupt pargraphs
			return "plain text"
		}
	}

	let multilineLeafBlocks = ["html block", "paragraph", "fenced code", "indented code block"];
	if (couldStartIndentedCode) {
		if (!multilineLeafBlocks.includes(lastUnclosedNode.nodeName)) { // indented code blocks can't interrupt other leaf blocks
			return "indented code block";
		}else {
			return "plain text";
		}
	}
	// Should last unclosed node be closed?
	return markerMeaning;
}

/** Parses a single line of text as markdown and adds it as a child or content to `lastOpenedNode`
 *  lastOpenedNode can either be a listItem Node or the root Node */
function parseLine(line: string, lastOpenedNode: HtmlNode) {
	let newLastOpenedNode = processBlankLine(line, lastOpenedNode);
	if (newLastOpenedNode)
		return newLastOpenedNode;	

	// tab characters should be replaced with 4 spaces
	line = line.replace(/^\t+/, (match)=>{
		return (' ').repeat(match.length*4);
	})
	
	let [markerMeaning, markerPos] = getLineSemantics(line);

	let openedInnerChild = getInnerMostOpenContainer(lastOpenedNode)
	if (markerMeaning !== "plain text" || openedInnerChild.nodeName !== "paragraph") { // content can't possibly be a paragraph continuation line
		lastOpenedNode = getValidOpenedAncestor(lastOpenedNode, markerPos);
		openedInnerChild = getInnerMostOpenContainer(lastOpenedNode)
	}

	markerMeaning = getActualMeaning(line, markerMeaning, openedInnerChild, markerPos - lastOpenedNode.indentLevel > 3)

	if (["html block", "fenced code"].includes(openedInnerChild.nodeName)) {
		// "html block" and "fenced code" nodes have to be closed before another child node can be added to their respective parents
		continueLeafBlocks(lastOpenedNode, line, markerPos, "plain text");
	}else if (!["ol-li", "ul-li", "blockquote"].includes(markerMeaning)) {
		continueLeafBlocks(lastOpenedNode, line, markerPos, markerMeaning);
	}else if (markerMeaning === "blockquote") {
		addOrUpdateBlockQuote(line, markerPos, lastOpenedNode)
	}else if (markerMeaning === "ol-li" || markerMeaning === "ul-li") {
		lastOpenedNode = addListItem(markerMeaning, lastOpenedNode, line, markerPos)
	}
	lastOpenedNode.nodeName === "li" && changeListIfLoose(lastOpenedNode);
	return lastOpenedNode;
}


// Returns the root node of a tree containing parsed markdown block structures from the parameter `textStream` as nodes
export default function generateBlockNodesTree(textStream: string, dangerousHtml: string[]) {
	let rootNode:HtmlNode = {parentNode: null as any, nodeName: "root", indentLevel: 0, closed: false, children: []};
	let lastOpenedNode = rootNode;
	const lines = textStream.split('\n');
	dangerousHtmlTags = dangerousHtml;

	for (let line of lines) {
		lastOpenedNode = parseLine(line, lastOpenedNode);
	}

	return rootNode;
}