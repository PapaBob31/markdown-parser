import type {HtmlNode, LinkRefDataMap} from "../index"
import { extractLinkRefsData } from "./inlineNodesParser/linkGenerator"
import { getHtmlTagEndPos } from "./inlineNodesParser"

/**
 * A node of the tree data structure generated when parsing the text
 * @typedef {Object} HtmlNode
 * @property {HtmlNode} parentNode - parent node of this node in the tree
 * @property {string} nodeName - name of the html the string represents
 * @property {string} textContent - plain text content of the node
 * @property {boolean} closed - indicates if a child nodes or textcontent can still be added to a node
 * @property {HtmlNode[]} children - All the child nodes of this node.
 * @property {?number} indentLevel - index where content must at least start from before it can count as this node's child. particularly useful for list item nodes
 * @property {?number} fenceLength - Used by fenced code block nodes. The length of fenced code block boundary
 * @property {?string} infoString - Node specific atrributes e.g type of marker a list is using, html block type
 * @property {?string} startNo - Start attribute value of ordered list nodes
 * @property {?boolean} tight - Indicates if a List is loose or tight according to the Common Mark spec
 */


/** Replaces each tab character in a text with space characters using a tab stop of 4 characters
 * @param {string} text - text containing the tab characters. All other characters in the text are expected to be whitespace
 * @param {number} charCountBeforeText - the number of characters before the text parameter. text param is exepected to be part of a larger string
 * @returns {string} - string with replaced tab characters */
function replaceTabsWithSpaces(text: string, charCountBeforeText: number) {
	let newText = ""
	for (let i=0; i<text.length; i++) {
		if (text[i] === '\t') {
			if ((charCountBeforeText + newText.length) === 4)  {
				newText += (' ').repeat(4)
			}else {
				newText += (' ').repeat(4 - ((charCountBeforeText + newText.length) % 4))
			}
		}else {
			newText += text[i]
		}
	}
	return newText
}


/** Checks if a line of text represents a thematic break according to the common mark spec
 * @param {string[]} textTokens - is an array of strings generated from the line of text which makes it easier to analyze
 * @param {number} startIndex - index to start processing from in the textTokens parameter
 * @returns {boolean} - indicating if line represent a thematic break*/
function lineRepsThematicBreak(textTokens: string[], startIndex: number) {
	let firstNWChar = "" // first non whitespace character
	let markerCount = 0;
	const thematicbreakMarkers = "*-_" // only acceptable non whitespace characters in a thematic break

	for (let j=startIndex; j < textTokens.length; j++) {
		let text = textTokens[j]
		for (let i=0; i< text.length; i++) {
			if ((/\s/).test(text[i])) {
				continue
			}else if (!firstNWChar && thematicbreakMarkers.includes(text[i])){
				firstNWChar = text[i]
				markerCount++;
			}else if (text[i] === firstNWChar) {
				// only valid characters of the same type or whitespace must be present 
				markerCount++;
			}else {
				return false;
			}
		}
	}

	if (markerCount < 3)
		return false

	return true;
}


/** Generates an array of tokens from the first line of a text found at a specified index. These generated tokens would be special 
 * markdown characters that might give the document structure and seperating the text content this way makes it easier to process
 * @param {string} text - text from which we are to generate tokens from
 * @param {number} startIndex - index to start the token generation
 * @returns */ // not annotated yet
function tokenizeLine(text: string, startIndex: number): [string[], number] {
	const tokens: string[] = []
	let curr_token = ""
	let i=startIndex;

	for (; i<text.length; i++) {
		if ((/\s/).test(text[i])){
			if (curr_token && !(/\s/).test(curr_token[0])) { // current token is not a whitespace token.

				// We want all contiguous whitespace characters to be one token, so we save the token we have so far and reset the buffer
				tokens.push(curr_token)
				curr_token = ""
			}

			// last newline at the end of a text should be ignored as it holds no senmatic or syntatic value in markdown
			if (text[i] !== '\n' || i !== text.length-1) 
				curr_token += text[i]

			if (text[i] === '\n') {
				if (curr_token)
					tokens.push(curr_token)
				return [tokens, i]
			}
		}else if (text[i] === '`' || text[i] === '~' || text[i] === "#"){
			if (curr_token && curr_token[0] != text[i]){
				// '`', '~' and '#' can only be part of tokens where all the characters are of the same type
				tokens.push(curr_token)
				curr_token = ""
			}
			curr_token += text[i]
		}else if (text[i] === '>'){
			if (curr_token){
				tokens.push(curr_token, text[i])
				curr_token = ""
			}
			else tokens.push(text[i])
		}else {
			if (curr_token && (curr_token[0] === '`' || curr_token[0] === '~' || curr_token[0] === "#")){
				tokens.push(curr_token)
				curr_token = ""
			}else if (curr_token && !(/\S/).test(curr_token[0])) {
				tokens.push(curr_token)
				curr_token = ""
			}

			curr_token += text[i]
		}

		if (i === text.length-1 )
			tokens.push(curr_token)
	}

	return [tokens, i]
}


/** Extracts the content of an Atx Header conforming to the comon mark spec
 * @param {string[]} textTokens - Array of tokens containing both the special atx header characters and it's content
 * @param {number} markerIndex - index of a valid starting atx header delimiter token
 * @returns {string} - text content of the header */
function getATXHeaderContent(textTokens: string[], markerIndex: number) {
	let content = ""
	let startTokenIndex = -1;

	for (let i=markerIndex+1; i<textTokens.length; i++) {
		if (textTokens[i][0] === "#" && (/\s/).test(textTokens[i-1][0])) {
			const textLen = textTokens.length
			if (i === textLen-1 || (i === textLen-2 && (/\s/).test(textTokens[i+1][0]))) {
				// token should be ignored according to the common mark spec because 
				// it's a string of contiguous '#' characters at the end of the text surrounded by whitespace
				continue;
			}
		}

		content += textTokens[i]
	}
	content = content.trim()

	return content 

}


/** Determines if a line of text contains a setext header indicator according to the common mark spec
 * @param {string[]} textTokens - Array of tokens genrated from the line of text. makes it easier to analyze
 * @param {number} startIndex - token index where the potential setext header indicator processing is to start from
 * @returns {string|null} - text that shows which type of header it is or null if none */
function getSetextHeaderType(textTokens: string[], startIndex: number) {
	let potentialType = ""
	for (let i=startIndex; i<textTokens.length; i++) {
		if (i === startIndex && (/^=+$/).test(textTokens[i])) {
			potentialType = "setext header h1"
		}else if (i === startIndex && (/^-+$/).test(textTokens[i])){
			potentialType = "setext header h2"
		}else if (!(/\s/).test(textTokens[i][0]) || i != textTokens.length-1) { // invalid non whitespace character or internal whitespace was found
			return null
		}
	}
	
	return potentialType
}


/** Gets the last unclosed paragraph leaf node descendant of a node
 * @param {HtmlNode} rootNode - node whose paragraph descendant we are trying to get
 * @returns {HtmlNode|null} - null or the leaf node if any */
function getInnerMostOpenParagraphNode(rootNode: HtmlNode): null|HtmlNode {
	if (rootNode.nodeName === "paragraph" && !rootNode.closed) {
		return rootNode
	}

	if (rootNode.closed || rootNode.children.length === 0)
		return null

	return getInnerMostOpenParagraphNode(rootNode.children[rootNode.children.length - 1])
}


/** joins the string in an array of strings into a single string
 * @param {string[]} textTokens - array whose string contents are to be joined
 * @param {number} [startIndex=0] - optional parameter specifying the index at which concatenation should start from. Defaults to zero.
 * @returns {string} - the string result of joining the strings */
function joinText(textTokens: string[], startIndex:number=0) {
	let textOutput = ""
	for (let i=startIndex; i<textTokens.length; i++)
		textOutput += textTokens[i]

	return textOutput

}


/** Gets a node's ancestor whose indentLevel attribute is less than or equal to a specified value. 
 * The first ancestor found that satisfies the previous condition is returned
 * @param {HtmlNode} currNode - The node whose ancestor we are trying to get
 * @param {number} indentLvl - value the indentLevel attribute of the ancestor must be less than or equal to
 * @returns {HtmlNode} - the ancestor found*/
function getNearestOpenedAncestor(currNode: HtmlNode, indentLvl: number): HtmlNode {
	if (["root", "li", "blockquote"].includes(currNode.nodeName) && currNode.indentLevel <= indentLvl){
		if (!currNode.closed){
			return currNode
		}
	}

	return getNearestOpenedAncestor(currNode.parentNode, indentLvl)

}


/** Creates a new list node
 * @param {string} listNodeParent - parent node of the new list node
 * @returns {string} markerDetails - string representing the list node type
 * @param {string} marker - string that was checked to determine the list node type
 * @returns {HtmlNode} - the newly created list node*/
function createListNode(listNodeParent: HtmlNode, markerDetails: string, marker: string) {
	let startNo = "-1"
	if (markerDetails === "list item n." || markerDetails === "list item n)") { // ordered lists
		startNo = marker.match(/^\d+/)[0]
	}
	const listNode: HtmlNode = {
		parentNode: listNodeParent,
		nodeName: "",
		closed: false, 
		children: [],
		tight: true,
		indentLevel: listNodeParent.indentLevel,
		startNo
	}

	if (["list item +", "list item -", "list item *"].includes(markerDetails)){
		listNode.nodeName = "ul"
	}else {
		listNode.nodeName = "ol"
	}

	listNode.infoString = markerDetails // Can be used to determine if a new list item starts a new list or is part of an existing list

	return listNode
}


/** Checks if a line of text satisfies the condition for ending an html block node
 * @param {string} blockType - Indicates the html block we are checking i.e."html block type 1", "html block type 2"
 * @param {string} line - Text to check if it terminates the html block
 * @returns {boolean} - Indicating if the line of text ends the html block type or not */
function htmlBlockEnded(blockType: string, line: string) {
	switch (blockType) {
		case "html block type 1": // script, pre and style tags
			return (/<\/(script|pre|style|textarea)>/i).test(line);
		case "html block type 2": // html comments
			return line.includes("-->")
		case "html block type 3":
			return line.includes("?>")
		case "html block type 4": // declarartion types e.g <!DOCTYPE html>
			return line.includes(">")
		case "html block type 5": // CDATA
			return line.includes("]]>")
	}
	return false;
}


/** The Common Mark spec defines 7 types of html block. Determines the html block type a string starts
 * @param {string} text - String to check to determine the html block type that it can start
 * @returns {string|null} - The Html block type the string starts or null if none */ 
function getHtmlBlockType(text: string) {
	let newNode: HtmlNode;
	let htmlPatterns = text.match(/^(<!--)(?!(?:>|->))/) || text.match(/^(<\/?)([^<\s>]+)/);
	let type6Tags = ["address", "article", "aside", "base", "basefont", "blockquote", "body", "caption", 
					"center", "col", "colgroup", "dd", "details", "dialog", "dir", "div", "dl", "dt", "fieldset", 
					"figcaption", "figure", "footer", "form", "frame", "frameset", "h1", "h2", "h3", "h4", "h5", 
					"h6", "head", "header", "hr", "html", "iframe", "legend", "li", "link", "main", "menu", 
					"menuitem", "nav", "noframes", "ol", "optgroup", "option", "p", "param", "section", "source", 
					"summary", "table", "tbody", "td", "tfoot", "th", "thead", "title", "tr", "track", "ul"]

	if (!htmlPatterns) {
		return null
	}/*else if (dangerousHtmlTags.includes(htmlPatterns[1].toLowerCase())) {
		return null
	}*/
	if (htmlPatterns[1] === "<!--") {
		return "html block type 2"
	}else {
		if (htmlPatterns[1] === "<" && ["script", "pre", "style", "textarea"].includes(htmlPatterns[2].toLowerCase())) {
			return "html block type 1"
		}else if (htmlPatterns[1] === "<" && htmlPatterns[2][0] === "?") {
			return "html block type 3"
		}else if (htmlPatterns[1] === "<" && (/![a-zA-Z]/).test(htmlPatterns[2].slice(0, 2))) {
			return "html block type 4"
		}else if (htmlPatterns[1] === "<" && htmlPatterns[2].slice(0, 8) === "![CDATA[") {
			return "html block type 5"
		}else if ((htmlPatterns[1] === "<" || htmlPatterns[1] === "</") && type6Tags.includes(htmlPatterns[2].toLowerCase())) {
			return "html block type 6"
		}else return null
	}
}


/** Determines the container block type a string indicates or start
 * @param {string} marker - the string to check
 * @returns {string} - text representing the container block type */
function getContainerBlockType(marker: string) {
	if (marker === ">"){
		return "blockquote"
	}else if ("-+*".includes(marker)) {
		return "list item " + marker
	}else if ((/^\d{1,9}(?:\.|\))$/).test(marker)){
		if (marker.length > 11)
			return null
		if (marker[marker.length-1] === ".")
			return "list item n."
		return "list item n)"
	}
	return null
}


/** Determines the leaf block type a string indicates or start
 * @param {string[]} textTokens - An array of strings (generated from the string), each with the potential of starting a new leaf block
 * @param {number} markerIndex - The index of the string we want to check in the textTokens parameter
 * @returns {string} - text representing the leaf block type */ 
function getLeafBlockType(textTokens: string[], markerIndex: number): string {
	const marker = textTokens[markerIndex]
	if (marker[0] === "#") {
		if (markerIndex !== textTokens.length-1 && (/\s/).test(textTokens[markerIndex+1][0]))
			if (marker.length <= 6)
				return "header"
		return "plain text"
	}else if (marker[0] === '`' && marker.length >= 3) {
		return "fenced code backtick"
	}else if (marker[0] === '~' && marker.length >= 3) {
		return "fenced code tilde"
	}else if (marker[0] === "=" || marker[0] === "-") {
		const headerType = getSetextHeaderType(textTokens, markerIndex)
		if (headerType)
			return headerType
	}
	const htmlBlockType = getHtmlBlockType(marker)
	if (htmlBlockType)
		return htmlBlockType
	else return "indeterminate"
}


/** Checks if a line of text can start a new fenced code block node and creates the node if it can
 * @param {string[]} textTokens - An array of strings (generated from the line of text) that's checked for fenced code block starting content
 * @param {number} tokenStartIndex - The index of the textTokens array that the check starts from
 * @returns {HtmlNode|null} - A newly created fenced code block node or null if it couldn't be created*/ 
function createFencedCodeBlockNode(textTokens: string[], tokenStartIndex: number) {
	let newNode: HtmlNode = {parentNode: null, nodeName: "", closed: false, children: [], textContent: "", infoString: "", fenceLength: 0}

	for (let i=tokenStartIndex; i<textTokens.length; i++) {
		// I'm always doing a regex test for whitespace
		// what if I compared the char with the escaped unicode reps for all whitespace characters, will that be faster
		if (!newNode.nodeName && (/\S/).test(textTokens[i])) {
			if (textTokens[i][0] === '`') {
				newNode.nodeName = "fenced code backtick"
				newNode.fenceLength = textTokens[i].length
			}else if (textTokens[i][0] === '~'){
				newNode.nodeName = "fenced code tilde" 
				newNode.fenceLength = textTokens[i].length
			}else return null
			continue;
		}else if (newNode.nodeName && !newNode.infoString && (/\S/).test(textTokens[i])) {
			newNode.infoString = joinText(textTokens, i)
		}

		// any text checked here is part of the fenced code block's info string
		if (newNode.nodeName === "fenced code backtick" && textTokens[i][0] === "`") { // Info strings for backtick fenced code blocks cannot contain backticks
			return null
		}
	}
	return newNode
}


/** Checks if a line of text terminates a fenced code block node's content
 * @param {HtmlNode} nodeToClose - The fenced code block node whose content is to be terminated
 * @param {string[]} textTokens - An array of strings (generated from the line of text) that's checked for fenced code block terminating content
 * @param {number} markerIndex - The index of the textTokens array where the check starts from
 * @returns {boolean} - Indicating if the line of text terminates the fenced code block node or not or not */
function lineEndsFencedCodeBlock(nodeToClose: HtmlNode, textTokens: string[], markerIndex: number){
	if (nodeToClose.nodeName === "fenced code tilde" && !(/^~+$/).test(textTokens[markerIndex])) {
		return false
	}else if (nodeToClose.nodeName === "fenced code backtick" && !(/^`+$/).test(textTokens[markerIndex])) {
		return false
	}else if (textTokens[markerIndex].length < nodeToClose.fenceLength) {
		return false
	}

	for (let i=markerIndex+1; i<textTokens.length; i++) {
		if ((/\S/).test(textTokens[i])) {
			return false
		}
	}

	return true

}


/** Performs any needed formatting on a line of text before adding it to a fenced code block's content
 * @param {HtmlNode} fencedCodeNode - The fenced code block node whose content is to be updated
 * @param {string} lineContent - The line of text to be added to the fenced code block's content
 * @param {HtmlNode} parentNode - The parent node of the fenced code block node */
function continueFencedCodeBlockContent(lineContent: string, fencedCodeNode: HtmlNode, parentNode: HtmlNode) {
	if (parentNode.indentLevel === fencedCodeNode.indentLevel){ // no opening fence indentation
		fencedCodeNode.textContent += lineContent.slice(parentNode.indentLevel)
	}else {
		const potIndentBeforeMarker = lineContent.slice(parentNode.indentLevel, fencedCodeNode.indentLevel) // potential indent before opening fence

		if ((/^\s+$/).test(potIndentBeforeMarker)) { // indent is greater than or equal to code block's opening fence indent
			fencedCodeNode.textContent += lineContent.slice(fencedCodeNode.indentLevel)
		}else {
			if ((/^\s+$/).test(lineContent)){
				fencedCodeNode.textContent += lineContent
			}else{
				// Although indent is less than code block's opening fence indent, It still has to be removed according to the commonmark spec
				fencedCodeNode.textContent += lineContent.slice(parentNode.indentLevel).trimStart();
			}
		}
	}
}


/** Checks if a string can start an html block type 7 according to the commonmark spec
 * @param {string} text - The string to be checked
 * @returns {boolean} - Indicating the string can start the html block or not */
function checkIfTextIsHTMLBlock7(text: string) {
	const tagEndPos = getHtmlTagEndPos(0, text, ["pre", "script", "style", "textarea"])
	const acceptedWhiteSpace = " \t"

	if (tagEndPos > -1){
		for (let i=tagEndPos+1; i<text.length; i++) {
			if (text[i] === '\n') {
				return true
			}else if (!acceptedWhiteSpace.includes(text[i])){
				return false
			}
		}
		return true
	}
	return false
}


/** Gets the first blockquote ancestor node or root node while traversing up the parser tree
 * @param {HtmlNode} node - The node where traversing starts from 
 * @returns {HtmlNode} - Either a blockquote node or a root node*/
function getNearestRootlikeAncestor(node: HtmlNode): HtmlNode {
	if (node.nodeName === "blockquote" || node.nodeName === "root") {
		return node // the node where traversal starts from may also be returned
	}else return getNearestRootlikeAncestor(node.parentNode)
}


/** Traverses the subtree rooted at a specified node and returns the first node 
 * whose content can potentially be terminated by a blank line of text
 * @param {HtmlNode} node - The node where traversing starts from 
 * @returns {HtmlNode} - Descendant (that can be terminated by a blank line) of the node parameter */
function getNodeClosableByBlankLine(node: HtmlNode): HtmlNode {
	while (true) {
		const childrenLen = node.children ? node.children.length : 0
		if (node.nodeName === "blockquote" || childrenLen === 0) {
			return node
		}else {
			node = node.children[childrenLen-1]
		}
	}
}


/** Finds and closes a node's descendant leaf or container node that can be terminated by a blank line
 * @param {HtmlNode} containerNodeLastProcessed - The node whose descendant leaf node is to be closed
 * @returns {HtmlNode} - The closest blockquote ancestor or the actual root node if a leaf node gets closed or null if no leaf node gets closed */
function closeLeafNodeTerminableByBlankLine(containerNodeLastProcessed: HtmlNode) {
	let blankNodeParent = containerNodeLastProcessed;
	if (blankNodeParent.nodeName !== "blockquote"){
		blankNodeParent = getNearestRootlikeAncestor(containerNodeLastProcessed)
	}

	if (blankNodeParent.children.length > 0){
		let affectedChildNode = getNodeClosableByBlankLine(blankNodeParent.children[blankNodeParent.children.length-1])

		if (["paragraph",  "blockquote", "li"].includes(affectedChildNode.nodeName) || 
			["html block type 6", "html block type 7"].includes(affectedChildNode.infoString)) {
			affectedChildNode.closed = true
		}

		if (affectedChildNode.closed) {
			return blankNodeParent
		}
	}
	
	return null
}


type valid_marker_type = "list item +" | "list item -" | "list item *" | "list item n." | "list item n)"


/** Determines if a list marker can actually start a list item acording to the common mark spec
 * @param {string[]} textTokens - An array of strings generated from the same line of text the list marker was found
 * @param {number} markerIndex - The index of the list marker text in the texTokens parameter
 * @param {("list item +"|"list item -"|"list item *"| "list item n."|"list item n)")} markerType - indicates if the 
 * list marker represents an ordered list item or an unordered list item
 * @param {HtmlNode} listItemAncestor - ancestor node of the list item that's about to be created
 * @returns {HtmlNode} - The closest blockquote ancestor or the actual root node itself if a leaf node gets closed or null if no leaf node gets closed */
function markerRepsValidListItem(textTokens: string[], markerIndex: number, markerType: valid_marker_type, listItemAncestor: HtmlNode) {
	let nextToken = null

	if (markerIndex !== textTokens.length-1){
		nextToken = textTokens[markerIndex+1]
	}

	let interruptedParagraph = null
	if (listItemAncestor.children.length > 0 && 
		listItemAncestor.children[listItemAncestor.children.length-1].nodeName === "paragraph"){
		interruptedParagraph = listItemAncestor.children[listItemAncestor.children.length-1]
	}

	if (interruptedParagraph) {
		if ((markerType === "list item n." || markerType === "list item n)") && !(/^1(?:\.|\))/).test(textTokens[markerIndex])) {
			return false // only ordered list items with a start number of 1 can interrupt paragraphs
		}else if (markerIndex >= textTokens.length-2) { // list item content starts with a blank line
			return false
		}
	}

	if (nextToken && nextToken[0] !== " " && nextToken[0] !== "\t" && nextToken[0] !== "\n") {
		return false
	}

	return true
}


/** Gets the last child of a node that's a list node
 * @param {HtmlNode} node - The node whose last child list node is to be returned
 * @returns {HtmlNode} - The closest blockquote ancestor or the actual root node itself if a leaf node gets closed or null if no leaf node gets closed */
function getLastProperChild(node: HtmlNode){
	for (let i=node.children.length-1; i>=0; i--) {
		if (node.children[i].nodeName === "blank" && i !== 0) {
			continue
		}else return node.children[i]
	}
}


/** Moves the last blank line node (if any) that was added to the tree to the appropriate position
 * in order to avoid wrong results when we later test for looseness of lists
 * @param {HtmlNode} blankNodeActualParent - The blank node's actual parent that also determines it's position in the tree*/
function moveBlankNodeToActualPosition(blankNodeActualParent: HtmlNode) {
	let nearestRootLikeAncestor = getNearestRootlikeAncestor(blankNodeActualParent)
	const lastChildNode = nearestRootLikeAncestor.children[nearestRootLikeAncestor.children.length-1]
	if (lastChildNode.nodeName === "blank"){
		lastChildNode.parentNode = blankNodeActualParent
		blankNodeActualParent.children.push(nearestRootLikeAncestor.children.pop())
	}
}


/** Creates a new list item node and adds it to the parser tree
 * @param {HtmlNode} ancestorNode - The parent node of the list item's parent list node
 * @param {string} listType - indicates the type of the list item node to be created 
 * @param {string} listItemMarker - The list item marker
 * @param {string} spaceBeforeMarker - whitespace before the list item marker string 
 * @returns {HtmlNode} - the newly created list item node */
function addNewListItemNodeToTree(ancestorNode: HtmlNode, listType: string, listItemMarker: string, spaceBeforeMarker: string) {
	let newListItemNode: HtmlNode = {parentNode: null, nodeName: "li", indentLevel: -1, closed: false, children: []}
	let parentListNode = null

	if (ancestorNode.children.length > 0 ) {

		let potentialParentList = getLastProperChild(ancestorNode)
		if (potentialParentList.infoString === listType && ["ol", "ul"].includes(potentialParentList.nodeName)) {
			parentListNode = potentialParentList
		}
	}
	if (!parentListNode) {
		parentListNode = createListNode(ancestorNode, listType, listItemMarker)
		if (ancestorNode.nodeName === "li"){
			moveBlankNodeToActualPosition(ancestorNode)
		}
		ancestorNode.children.push(parentListNode)
	}else {
		moveBlankNodeToActualPosition(parentListNode)
	}
	newListItemNode.parentNode = parentListNode;

	parentListNode.children.push(newListItemNode)
	return newListItemNode
}


/** Determines the value of the `indentLevel` attribute of a list item node
 * @param {string[]} textTokens - An array of strings generated from the same line of text the list marker was found
 * @param {number} tokenIndex - The index of the list marker text in the texTokens parameter
 * @param {number} tokenEndIndex - The index of the last character of the list marker in the line of text that was transformed into textTokens 
 * @returns {number} - The `indentLevel` value */
function getListItemIndentLvl(textTokens: string[], tokenIndex: number, tokenEndIndex: number) {
	if (tokenIndex === textTokens.length-2) { // list marker is followed by whitespace and nothing else
		return tokenEndIndex + 2;
	}else if (tokenIndex < textTokens.length-2) {
		const nextWhitespaceChunk = replaceTabsWithSpaces(textTokens[tokenIndex+1], tokenEndIndex+1)
		if (nextWhitespaceChunk.length < 5)
			return tokenEndIndex + nextWhitespaceChunk.length + 1;
	}

	return tokenEndIndex + 2;

}


/** Updates a node's last child content if the last child is an indented code block node
 * @param {string[]} textTokens - An array of strings generated from the line of text that's to be added to the indented code block content
 * @param {number} contentStartIndex - The index where the new content starts from in textTokens
 * @param {HtmlNode} parentNode - Ths node whose last child is to be updated if possible
 * @param {boolean} lineIsBlank - Indicates that the line of text to be added is blank
 * @returns {boolean} - true if the update is successful, false if not*/
function updateIndentedCodeNodeContent(textTokens: string[], contentStartIndex: number, parentNode: HtmlNode, lineIsBlank: boolean) {
	let lastOpenedChildNode = null;
	let childrenLen = parentNode.children.length

	if (childrenLen > 0){
		lastOpenedChildNode = parentNode.children[childrenLen-1]
		if (lastOpenedChildNode.nodeName === "indented code block") {
			if (lineIsBlank){
				let content = joinText(textTokens, contentStartIndex).slice(parentNode.indentLevel+4)
				if (content)
					lastOpenedChildNode.textContent += content
				else // content is a blank line and the initial spaces at the beginning are not up to 4 spaces so we get an empty string after removing the 4 spaces
					lastOpenedChildNode.textContent += '\n' // but we still need to show that the blank line was there regardless
			}else
				lastOpenedChildNode.textContent += joinText(textTokens, 0).slice(parentNode.indentLevel+4)
			return true
		}else return false
	}
	return false
}

/** Process text that could be part of a paragraph node or html block type 7 node  
 * @param {string[]} textTokens - An array of strings generated from the text that will be part of any newly created or already existing node
 * @param {HtmlNode} parentNode - This node will be the parent node to any newly created node
 * @param {number} contentStartIndex - The index where the new or existing node's text starts from in textTokens
 * @returns {boolean} - true if a new node was created, false if the text is just a paragraph continuation line */
function processParagraphOrHtml7Text(textTokens: string[], parentNode: HtmlNode, contentStartIndex: number) {
	let continuedParagraph = getInnerMostOpenParagraphNode(parentNode)
	if (continuedParagraph) {
		continuedParagraph.textContent += joinText(textTokens, contentStartIndex).trimStart();
	}else {
		let blockType = "paragraph"
		let infoString = ""
		let content = joinText(textTokens, 0).slice(parentNode.indentLevel)
		const textIsHtmlBlock7 = checkIfTextIsHTMLBlock7(content)
		if (textIsHtmlBlock7){
			blockType = "html block"
			infoString = "html block type 7"
		}
		parentNode.children.push(
			{parentNode: parentNode, nodeName: blockType, infoString, closed: false, children: [], textContent: joinText(textTokens, contentStartIndex)}
		)
		return true
	}
	return false
}


/** Creates a new header node that follows the setext header syntax
 * @param {HtmlNode} headerParentNode - parent node of the new header node to be careated
 * @param {string} headerType - setext header h1 | setext header h2
 * @param {Object} linkRefsMap - Dictionary or Hash map mapping link labels to link attributes from commonmark link reference definitions 
 * @returns {HtmlNode} - The newly created header node or null */
function addSetextHeaderNode(headerParentNode: HtmlNode, headerType: string, linkRefsMap: LinkRefDataMap) {
	let paragraphBeforeLine = null
	if (headerParentNode.children.length > 0 && headerParentNode.children[headerParentNode.children.length-1].nodeName === "paragraph") {
		paragraphBeforeLine = headerParentNode.children[headerParentNode.children.length-1] // content is the text before the setext header underline
	}
	if (paragraphBeforeLine && !paragraphBeforeLine.closed) {
		let newText = extractLinkRefsData(paragraphBeforeLine.textContent.trim(), linkRefsMap);
		if (newText) {
			paragraphBeforeLine.nodeName = headerType === "setext header h1" ? "h1" : "h2"
			paragraphBeforeLine.textContent = newText;
			paragraphBeforeLine.closed = true
		}else { // the text was a link reference definition
			return null
		}			
		return paragraphBeforeLine

	}
	return null
}


/** Creates a new html block node and adds it to the parser tree
 * @param {HtmlNode} parentNode - parent node of the new html block node
 * @param {string~~~add the type later} htmlBlockType - represents the type of html block 
 * @returns {HtmlNode} - The newly created html block node */
function addHtmlBlockNode(parentNode: HtmlNode, textTokens: string[], htmlBlockType: string) {
	const newHtmlBlockNode: HtmlNode = {
		parentNode, 
		nodeName: "html block",
		closed: false, 
		textContent: joinText(textTokens, 0).slice(parentNode.indentLevel), 
		infoString: htmlBlockType,
		children: []
	}
	parentNode.children.push(newHtmlBlockNode)

	if (htmlBlockEnded(newHtmlBlockNode.infoString, newHtmlBlockNode.textContent)){
		newHtmlBlockNode.closed = true
	}
	return newHtmlBlockNode
}


/** Creates and adds leaf block nodes (fenced code blocks, setext headers, atx header and html blocks of type 1-6) if they satisfy the conditions needed
 * @param {string} potentialBlockType - Indicates the type of leaf block node that's to be created
 * @param {HtmlNode} containerParentNode - parent node of the new leaf block node
 * @param {number} leafBlockStartIndex - The index where the new node starts in textTokens
 * @param {Object} linkRefsMap - Dictionary or Hash map mapping link labels to link attributes from commonmark link reference definitions 
 * @returns {HtmlNode|null} - The newly created leaf block node or null if none was created */
function addNonParagraphLeafBlockNode(
	potentialBlockType: string, containerParentNode: HtmlNode, textTokens: string[], leafBlockStartIndex: number, linkRefsMap: LinkRefDataMap,
	) {
	let wsBeforeNodeDelimiter = "" // whitespace before the first character of a node's content or delimiter
	if (leafBlockStartIndex > 0 && (/\s/).test(textTokens[leafBlockStartIndex-1][0]))
		wsBeforeNodeDelimiter = textTokens[leafBlockStartIndex-1]

	if (potentialBlockType && potentialBlockType.startsWith("fenced code")) {
		const codeBlockNode = createFencedCodeBlockNode(textTokens, leafBlockStartIndex)
		if (codeBlockNode) {
			codeBlockNode.parentNode = containerParentNode;
			codeBlockNode.indentLevel = containerParentNode.indentLevel + wsBeforeNodeDelimiter.length // indentation before the opening fence of a fenced code block
			containerParentNode.children.push(codeBlockNode)
			return codeBlockNode;
		}else {
			return null
		}
	}else if (potentialBlockType && potentialBlockType.startsWith("setext header")) {
		const nodeAdded = addSetextHeaderNode(containerParentNode, potentialBlockType, linkRefsMap)
		if (nodeAdded) // valid setext header and not possibly a thematic break
			return nodeAdded
	}else if (potentialBlockType === "header") { // atx header node
		let marker = textTokens[leafBlockStartIndex];
		containerParentNode.children.push(
			{parentNode: containerParentNode, nodeName: `h${marker.length}`, closed: true, children: [], textContent: getATXHeaderContent(textTokens, leafBlockStartIndex)}
		)
		return containerParentNode.children[containerParentNode.children.length-1]
	}else if (potentialBlockType && potentialBlockType.startsWith("html block")) {
		const newHtmlBlockNode = addHtmlBlockNode(containerParentNode, textTokens, potentialBlockType)
		return newHtmlBlockNode
	}
	return null
}


/** Gets a node's last descendant leaf node or the last closed descendant container node at any level
 * @param {HtmlNode} node - The node whose last descendant node is to be returned
 * @returns {HtmlNode} - The descendant node found, can also be the node itself if it's closed already. */
function getDescendantLeafOrClosedContainerNode(node: HtmlNode): HtmlNode {
	let lastChildNode = null
	if (node.children && node.children.length > 0)
		lastChildNode = node.children[node.children.length-1];

	if (!node.closed && lastChildNode && ["li", "ul", "ol", "blank"].includes(lastChildNode.nodeName)){
		if (lastChildNode.nodeName === "blank" && node.children.length > 0)
			return getDescendantLeafOrClosedContainerNode(node.children[node.children.length-2])
		return getDescendantLeafOrClosedContainerNode(node.children[node.children.length-1])
	}else {
		return node
	}
}


/** Updates a non paragraph leaf node whose content span multiple lines using this line of text
 * @param {string[]} textTokens - An array of strings generated from the line of text that's to be added to the node's content
 * @param {number} tokenIndex - The index where the new content starts in textTokens
 * @param {number} tokenStartIndex - The character index in the line of text where the content starts from
 * @returns {boolean} - true if the update is successful, false if not */
function continueOpenedNonParagraphContent(parentNode: HtmlNode, textTokens: string[], tokenIndex: number, tokenStartIndex: number, lineIsBlank: boolean){
	let childrenLen = parentNode.children.length

	if (childrenLen > 0){
		let lastOpenedChildNode = parentNode.children[childrenLen-1]
		if (lastOpenedChildNode.nodeName.startsWith("fenced code") && !lastOpenedChildNode.closed){
			if ((tokenStartIndex - parentNode.indentLevel) < 4 && lineEndsFencedCodeBlock(lastOpenedChildNode, textTokens, tokenIndex)) {
				lastOpenedChildNode.closed = true
			}else{
				continueFencedCodeBlockContent(joinText(textTokens, 0), lastOpenedChildNode, parentNode)
			}
			return true
		}else if (lastOpenedChildNode.nodeName === "html block" && !lastOpenedChildNode.closed){
			// line is sliced incase the ancestor is a list node that requires indentation so the whitespace is removed
			const content = joinText(textTokens, 0).slice(parentNode.indentLevel) 
			if (htmlBlockEnded(lastOpenedChildNode.infoString, content)){
				lastOpenedChildNode.closed = true
			}
			lastOpenedChildNode.textContent += content
			return true
		}else if ((parentNode.indentLevel !== undefined && (tokenStartIndex - parentNode.indentLevel) >= 4) || lineIsBlank){ // line continues or starts a new indented code block
			const contentUpdated = updateIndentedCodeNodeContent(textTokens, tokenIndex, parentNode, lineIsBlank)
			if (contentUpdated) {
				return true
			}
		}
	}

	return false
}


/** Creates new non paragraph and non html type 7 leaf block nodes given a line of text with the appropriate syntax
 * @param {HtmlNode} parentNode - parent node of the new leaf block node
 * @param {string[]} textTokens - An array of strings generated from the line of text that's to be added to the node's content
 * @param {number} tokenIndex - The index where the new content starts in textTokens
 * @param {number} tokenStartIndex - The character index in the line of text where the node to be created content starts from
 * @param {boolean} lineIsBlank - Indicates if the line of text is a blank line or not
 * @param {Object} linkRefsMap - Dictionary or Hash map mapping link labels to link attributes from commonmark link reference definitions 
 * @returns {string} - Name of the newly created node if it was created or some other text giving a short description of why a new node wasn't ccreated */
function createNonParagraphAndNonHtml7Nodes(
	parentNode: HtmlNode, tokenStartIndex: number, textTokens: string[], tokenIndex: number, linkRefsMap: LinkRefDataMap) {
	let potentialBlockType = null

	if ((parentNode.indentLevel !== undefined && (tokenStartIndex - parentNode.indentLevel) >= 4)){ // line starts a new indented code block
		if (getInnerMostOpenParagraphNode(parentNode)) {
			potentialBlockType = "plain text" // indented code blocks can't interrupt paragraphs
		}else {
			parentNode.children.push(
				{parentNode: parentNode, nodeName: "indented code block", closed: false, 
				textContent: joinText(textTokens, 0).slice(parentNode.indentLevel+4), children: []}
			)
			return "indented code block"
		}
	}else potentialBlockType = getLeafBlockType(textTokens, tokenIndex);

	if (potentialBlockType !== "plain text"){
		let newNode = addNonParagraphLeafBlockNode(potentialBlockType, parentNode, textTokens, tokenIndex, linkRefsMap)
		if (!newNode){
			if (lineRepsThematicBreak(textTokens, tokenIndex)) {
				parentNode.children.push({parentNode: parentNode, nodeName: "hr", closed: true, children: []});
				newNode =  parentNode.children[parentNode.children.length-1]
			}else potentialBlockType = "indeterminate"
		}
		if (newNode)
			return newNode.nodeName
	}

	return potentialBlockType
}


/** Creates a new blockquote node and return it or return an existing blockquote node
 * @param {HtmlNode} nearestOpenedAncestor - The parent node of the new or existing blockquote node
 * @param {string[]} textTokens - An array of strings generated from the line of text that was parsed to get the blockquote node
 * @returns {HtmlNode} - the blockquote node that was created or updated */
function getBlockQuoteNode(nearestOpenedAncestor: HtmlNode, textTokens: string[], i: number) {
	const childLen = nearestOpenedAncestor.children.length;
	if (nearestOpenedAncestor.children.length > 0){

		const lastChildNode: HtmlNode = nearestOpenedAncestor.children[childLen-1]
		if (lastChildNode.nodeName === "blockquote" && !lastChildNode.closed){ // existing unclosed blockquote node
			// lastChildNode.infoString = i.toString()
			lastChildNode.indentLevel = 1;
			
			if (i<textTokens.length-1 && (/\s/).test(textTokens[i+1][0])) {
				lastChildNode.indentLevel += 1;
			}
			
			return lastChildNode; // blockquote continuation
		}
	}

	const newNode: HtmlNode = {
		parentNode: nearestOpenedAncestor, nodeName: "blockquote",indentLevel: 1, closed: false, children: []/*, infoString: i.toString()*/
	};
	if (i<textTokens.length-1 && (/\s/).test(textTokens[i+1][0])) {
		newNode.indentLevel += 1;
	}

	nearestOpenedAncestor.children.push(newNode)
	nearestOpenedAncestor = newNode

	return newNode
}


/** Creates and add markdown blocks (as determined by the semantics of the text token) to a (abstract syntax?) tree
 * @param {Htmlnode} lastOpenedContainerNode - is the root node or the last opened list item node that has no blockquote node as an ancestor
 * @param {string[]} textTokens - is an array of strings generated from a line of text where each string could potentially indicate a markdown container block
 * @param {Object} linkRefsMap - Dictionary or Hash map mapping link labels to link attributes from commonmark link reference definitions
 * @returns {Htmlnode} - The last container node that was processed */
function addBlockNodesToTree(lastOpenedContainerNode: HtmlNode, textTokens: string[], linkRefsMap: LinkRefDataMap) {
	let tokenEndIndex = -1 
	let tokenStartIndex = -1
	let nearestOpenedAncestor = null // nearest opened container node ancestor of the node that's to be created
	let lastWhiteSpaceChunk = ""
	let lineIsBlank = false
	let outerMostBlockQuoteNode = null

	for (let i=0;i<textTokens.length;i++) {
		const token = textTokens[i];
		tokenStartIndex = tokenEndIndex + 1 // index where the token being processed starts in the line of text the tokens were generated from

		if ((/\s/).test(token[0])){ // token's characters are all white space
			if (i === textTokens.length-1 && (textTokens.length === 1 || nearestOpenedAncestor?.nodeName === "blockquote")){
				lineIsBlank = true
			}else { 
				textTokens[i] = replaceTabsWithSpaces(token, tokenEndIndex+1) // tabs in the token should be replaced with spaces according to the commonmark spec
				tokenEndIndex += textTokens[i].length // We want indent level to be the last space character index by design (wrong comment)
				lastWhiteSpaceChunk = textTokens[i]
				continue;
			}
		}

		if (nearestOpenedAncestor && nearestOpenedAncestor.nodeName === "blockquote"){
			lastOpenedContainerNode = getDescendantLeafOrClosedContainerNode(nearestOpenedAncestor) 
			nearestOpenedAncestor = null;
		}

		// index where the token being processed ends in the line of text the tokens were generated from
		tokenEndIndex += token.length;

		if (!nearestOpenedAncestor && !lineIsBlank){
			// line must not be blank because the indentation of the first non whitespace character determines `nearestOpenedAncestor` node below
			nearestOpenedAncestor = getNearestOpenedAncestor(lastOpenedContainerNode, tokenStartIndex) // ancestor node to the new or continued container node
		}

		if (lineIsBlank){
			if (!nearestOpenedAncestor)
				nearestOpenedAncestor = lastOpenedContainerNode;

			// nearest ancestor container node with a visible boundary (not indentation) for it's child node (i.e. blockquote or the actual root node)
			const closedNodeRootlikeAncestor = closeLeafNodeTerminableByBlankLine(nearestOpenedAncestor);
			

			if (closedNodeRootlikeAncestor) {
				/* It's unclear the actual parent node of the new blank node so we pick the highest node that can potentially be the parent (closedNodeRootlikeAncestor)
				The position of the blank node might get changed in the tree after adding the next non blank line node to the tree */
				if (closedNodeRootlikeAncestor.children[closedNodeRootlikeAncestor.children.length-1].nodeName !== "blank")
					closedNodeRootlikeAncestor.children.push({parentNode: closedNodeRootlikeAncestor, nodeName: "blank", closed: true, children: []});
				break;
			}
		}

		const contentContinued = continueOpenedNonParagraphContent(nearestOpenedAncestor, textTokens, i, tokenStartIndex, lineIsBlank)
		if (contentContinued || lineIsBlank) { // line is part of an existing node content or it can't possibly be part of any other node's content
			break;
		}

		let nodeCreated = createNonParagraphAndNonHtml7Nodes(nearestOpenedAncestor, tokenStartIndex, textTokens, i, linkRefsMap)
		
		let containerType:string = null
		if (nodeCreated === "indeterminate")
			containerType = getContainerBlockType(token)

		if (containerType && containerType !== "blockquote"){
			if (!markerRepsValidListItem(textTokens, i, containerType as valid_marker_type, nearestOpenedAncestor)) {
				containerType = "plain text"
			}
		}

		if (containerType === "blockquote") {
			nearestOpenedAncestor = getBlockQuoteNode(nearestOpenedAncestor, textTokens, i)
			tokenStartIndex = 0; // reset bcos of potential list item node whose content relies on indentation relative to root or nearest blockquote ancestor 
			tokenEndIndex = 0; // reset bcos of potential list item node whose content relies on indentation relative to root or nearest blockquote ancestor 
			if (!outerMostBlockQuoteNode)
				outerMostBlockQuoteNode = nearestOpenedAncestor;
			continue;
		}else if (containerType && containerType !== "plain text") { // list item 
			const newListItemNode = addNewListItemNodeToTree(nearestOpenedAncestor, containerType, textTokens[i], lastWhiteSpaceChunk)
			newListItemNode.indentLevel = getListItemIndentLvl(textTokens, i, tokenEndIndex)
			nearestOpenedAncestor = newListItemNode
			continue;
		}

		let newParagraphNode = false
		if (!lineIsBlank && ["indeterminate", "plain text"].includes(nodeCreated)){
			newParagraphNode = processParagraphOrHtml7Text(textTokens, nearestOpenedAncestor, i)
			if (!newParagraphNode) { // paragraph continuation line
				nearestOpenedAncestor = lastOpenedContainerNode
				break;
			}
		}
		if (!["indeterminate", "plain text"].includes(nodeCreated) || newParagraphNode){ // New leaf node was created
			if (nearestOpenedAncestor.nodeName === "li"){ // nearestOpenedAncestor is also the parent node for the new node
				const newNode = nearestOpenedAncestor.children.pop()
				moveBlankNodeToActualPosition(nearestOpenedAncestor)
				nearestOpenedAncestor.children.push(newNode)
			}
			break;
		}
		lastWhiteSpaceChunk = ""
	}

	if (outerMostBlockQuoteNode) { // `nearestOpenedAncestor` is a blockquote node's descendant
		/* This prevents the next line from using this blockquote descendant as a potential parent node
		 because the next line of text is expected to continue outside any blockqute node */
		nearestOpenedAncestor = outerMostBlockQuoteNode.parentNode 
	}
	
	return nearestOpenedAncestor
}


/** Determines if a list is loose or not
 * @param {HtmlNode} node - The node where traversal is to start from 
 * @return {boolean} - Indicating the list is loose or not*/
function listIsLoose(listNode: HtmlNode) {
	for (let i=0; i<listNode.children.length; i++) {
		if (i !== 0 && i !== listNode.children.length-1 && listNode.children[i].nodeName === "blank") {
			return true
		}else if (listNode.children[i].nodeName === "li") {
			const listItemNode = listNode.children[i]
			for (let j=0; j<listItemNode.children.length-1; j++) {
				if (j !== 0 && listItemNode.children[j].nodeName === "blank") {
					return true
				}
			}
		}
	}
	return false
}


/** Recursively traverse a tree and mark any list node found to be loose as explicitly loose
 * @param {HtmlNode} node - The node where traversal is to start from */
function setLooseListNodesAsLoose(node: HtmlNode) {
	if ((node.nodeName === "ol" || node.nodeName === "ul") && listIsLoose(node)) {
		node.tight = false
	}

	if (node.children && node.children.length > 0) {
		for (let i=0; i<node.children.length; i++) {
			setLooseListNodesAsLoose(node.children[i])
		}
	}
}


/** Generates a new (abstract syntax?) tree from a text
 * @param {string} textStream - The text the tree will be generated from
 * @param {Object} linkRefsMap -  Dictionary or Hash map mapping link labels to link attributes from commonmark link reference definitions 
 * @param {string[]} dangerousHtml - List of html tag names whose tags we don't want as part of output when parsing the markdown text*/
export default function generateBlockNodesTree(textStream: string, linkRefsMap: LinkRefDataMap, dangerousHtml: string[]) {
	let i = 0;
	let rootNode:HtmlNode = {parentNode: null as any, nodeName: "root", indentLevel: 0, closed: false, children: []};
	let lastOpenedNode = rootNode;
	const linkRefs = []

	while (true) {
		let lineTokens: string[] = [];
		[lineTokens, i] = tokenizeLine(textStream, i);
		i++;
		lastOpenedNode = addBlockNodesToTree(lastOpenedNode, lineTokens, linkRefsMap)

		if (i >= textStream.length-1){
			setLooseListNodesAsLoose(rootNode)
			return rootNode
		}
	}
}

