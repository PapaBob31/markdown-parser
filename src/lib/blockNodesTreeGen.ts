import type {HtmlNode, LinkRefDataMap} from "../index"
import { extractLinkRefsData } from "./inlineNodesParser/linkGenerator"
import { getHtmlTagEndPos } from "./inlineNodesParser"

function lineRepsThematicBreak(textTokens: string[], startIndex: number) {
	let firstNWChar = ""
	let markerCount = 0;

	for (let j=startIndex; j < textTokens.length; j++) {
		let text = textTokens[j]
		for (let i=0; i< text.length; i++) {
			if ((/\s/).test(text[i])) {
				continue
			}else if (!firstNWChar && "*-_".includes(text[i])){
				firstNWChar = text[i]
				markerCount++;
			}else if (text[i] === firstNWChar) {
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

function tokenizeLine(text: string, startIndex: number): [string[], number] {
	const tokens: string[] = []
	// const punctuations = "!#$%&'()*+,-./:;<=>?@,[\\]^_`,{|}~"
	let curr_token = ""
	let i=startIndex;

	for (; i<text.length; i++) {
		if ((/\s/).test(text[i])){
			if (curr_token && !(/\s/).test(curr_token[0])) {
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

function getATXHeaderContent(textTokens: string[], markerIndex: number) {
	let content = ""
	let startTokenIndex = -1;

	for (let i=markerIndex+1; i<textTokens.length; i++) {
		if (textTokens[i][0] === "#" && (/\s/).test(textTokens[i-1][0])) {
			const textLen = textTokens.length
			if (i === textLen-1 || (i === textLen-2 && (/\s/).test(textTokens[i+1][0]))) {
				// console.log(textTokens, i, textTokens[i])
				continue;
			}
		}

		content += textTokens[i]
	}
	content = content.trim()

	return content 

}


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



function getSetextHeaderType(textTokens: string[], startIndex: number) {
	let potentialType = ""
	for (let i=startIndex; i<textTokens.length; i++) {
		if (i === startIndex && (/^=+$/).test(textTokens[i])) {
			potentialType = "setext header h1"
		}else if (i === startIndex && (/^-+$/).test(textTokens[i])){
			potentialType = "setext header h2"
		}else if (!(/\s/).test(textTokens[i][0]) || i != textTokens.length-1) {
			return null
		}
	}
	
	return potentialType
}



function getInnerMostOpenParagraphNode(rootNode: HtmlNode): null|HtmlNode {
	if (rootNode.nodeName === "paragraph" && !rootNode.closed) {
		return rootNode
	}

	if (rootNode.closed || rootNode.children.length === 0)
		return null

	return getInnerMostOpenParagraphNode(rootNode.children[rootNode.children.length - 1])
}


function joinText(textTokens: string[], startIndex:number=0) {
	let textOutput = ""
	for (let i=startIndex; i<textTokens.length; i++)
		textOutput += textTokens[i]

	return textOutput

}


function getNearestOpenedAncestor(currNode: HtmlNode, indentLvl: number): HtmlNode {
	if (["root", "li", "blockquote"].includes(currNode.nodeName) && currNode.indentLevel <= indentLvl){
		if (!currNode.closed){
			return currNode
		}
	}

	return getNearestOpenedAncestor(currNode.parentNode, indentLvl)

}

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




function getListNode(listNodeParent: HtmlNode, markerDetails: string, marker: string) {
	let startNo = "-1"
	if (markerDetails === "list item n." || markerDetails === "list item n)") {
		startNo = marker.match(/^\d+/)[0]
	}
	const listNode: HtmlNode = {
		parentNode: listNodeParent,
		nodeName: "",
		closed: false, 
		children: [],
		tight: "true",
		indentLevel: listNodeParent.indentLevel,
		startNo
	}

	if (["list item +", "list item -", "list item *"].includes(markerDetails)){
		listNode.nodeName = "ul"
	}else {
		listNode.nodeName = "ol"
	}

	listNode.infoString = markerDetails

	return listNode
}


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


/** The Common Mark spec defines 7 types of html block
 * Returns the type of html block that the line parameter starts */ 
function getHtmlBlockType(text: string) {
	let newNode: HtmlNode;
	// let htmlPatterns = text.match(/\s*(<!--)(?!(?:>|->))/) || text.match(/<([^<\s>][^\s>]*)/);
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
		}else if (htmlPatterns[1] === "<" && htmlPatterns[2][0] === "!") { // this should be checked after block 5
			return "html block type 4"
		}else if (htmlPatterns[1] === "<" && htmlPatterns[2].slice(0, 8) === "![CDATA[") {
			return "html block type 5"
		}else if ((htmlPatterns[1] === "<" || htmlPatterns[1] === "</") && type6Tags.includes(htmlPatterns[2].toLowerCase())) {
			return "html block type 6"
		}else return null
	}
}

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


function getFirstWord(textTokens: string[], startIndex: number) {
	const punctuations = "!#$%&'()*+,-./:;<=>?@,[\\]^_`,{|}~"
	const textAFterMarker = joinText(textTokens, startIndex)
	let firstWord = ""

	for (let i=0; i<textAFterMarker.length; i++) {
		const char = textAFterMarker[i]
		if ((/\s/).test(char)){
			return firstWord
		}
		if (punctuations.includes(char))  {
			if (char === "\\")
				continue
			if (i===0 || textAFterMarker[i-1] !== '\\') {
				if (!firstWord)
					return char
				return firstWord
			}
		}
		firstWord += char
	}

	return firstWord
}

function getFencedCodeBlockNode(textTokens: string[], tokenStartIndex: number) {
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
			}
			else return null
			continue;
		}else if (newNode.nodeName && !newNode.infoString && (/\S/).test(textTokens[i])) {
			newNode.infoString = getFirstWord(textTokens, i)
		}

		if (newNode.nodeName === "fenced code backtick" && textTokens[i][0] === "`") {
			return null
		}
	}

	return newNode

}

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


function continueFencedCodeBlockContent(textTokens: string[], fencedCodeNode: HtmlNode, parentNode: HtmlNode) {
	let lineContent =  joinText(textTokens, 0)
	if (parentNode.indentLevel === fencedCodeNode.indentLevel){
		fencedCodeNode.textContent += lineContent.slice(parentNode.indentLevel)
	}else {
		const potIndentBeforeMarker = lineContent.slice(parentNode.indentLevel, fencedCodeNode.indentLevel)
		if ((/^\s+$/).test(potIndentBeforeMarker)) {
			// indent is greater than or equal to code block's start delimiter indent
			fencedCodeNode.textContent += lineContent.slice(fencedCodeNode.indentLevel)
		}else {
			// indent is less than code block's start delimiter indent 
			// so the whitespace beefore the catual content needs to be removed
			if ((/^\s+$/).test(lineContent)){
				fencedCodeNode.textContent += lineContent
			}else fencedCodeNode.textContent += lineContent.slice(parentNode.indentLevel).trimStart();
		}
	}
}


function checkIfTextIsHTMLBlock7(text: string) {
	const tagEndPos = getHtmlTagEndPos(0, text, ["pre", "script", "style", "textarea"])

	if (tagEndPos > -1){
		for (let i=tagEndPos+1; i<text.length; i++) {
			if (text[i] === '\n') {
				return true
			}else if ((/\S/).test(text[i])){
				return false
			}
		}
		return true
	}
	return false
}

function getNearestRootlikeAncestor(node: HtmlNode): HtmlNode {
	if (node.nodeName === "blockquote" || node.nodeName === "root") {
		return node
	}else return getNearestRootlikeAncestor(node.parentNode)
}

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

function closeLeafNodeTerminatedByBlankLine(containerNodeLastProcessed: HtmlNode, tokenStartIndex: number) {
	let nodeAffectedByBlankLine = containerNodeLastProcessed;
	if (nodeAffectedByBlankLine.nodeName !== "blockquote"){
		// should we just keep a ref to root in the first place since we are effectively going there anyways
		// nodeAffectedByBlankLine = getNearestOpenedAncestor(containerNodeLastProcessed, tokenStartIndex)
		nodeAffectedByBlankLine = getNearestRootlikeAncestor(containerNodeLastProcessed)
	}

	if (nodeAffectedByBlankLine.children.length > 0){
		let affectedChildNode = getNodeClosableByBlankLine(nodeAffectedByBlankLine.children[nodeAffectedByBlankLine.children.length-1])

		if (affectedChildNode.nodeName === "li")
			affectedChildNode.closed = true
			// if (affectedChildNode.parentNode.children.length === 1)
			// 	affectedChildNode = mergeWithPrevParagraphIfAny(affectedChildNode)
		else if (["paragraph",  "blockquote"].includes(affectedChildNode.nodeName) || 
			["html block type 6", "html block type 7"].includes(affectedChildNode.infoString)) {
			affectedChildNode.closed = true
		}

		if (affectedChildNode.closed) {
			nodeAffectedByBlankLine.children.push({parentNode: nodeAffectedByBlankLine, nodeName: "blank", closed: true, children: []});
			return containerNodeLastProcessed;
		}
	}
	
	return null
}


function markerRepsValidListItem(textTokens: string[], markerIndex: number, markerType: string, listItemAncestor: HtmlNode) {
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
		if (!nextToken || (markerIndex === textTokens.length-2 && !(/\s/).test(nextToken[0]))) {
			return false
		}else if ((markerType === "list item n." || markerType === "list item n)") && !(/^1(?:\.|\))/).test(textTokens[markerIndex])) {
			return false
		}
	}

	if (nextToken && !(/\s/).test(nextToken[0])) {
		return false
	}
	return true
}


function getLastListNodeChild(node: HtmlNode){
	for (let i=node.children.length-1; i>=0; i--) {
		if (node.children[i].nodeName === "ol" || node.children[i].nodeName === "ul"){
			return node.children[i]
		}else if (i==0 || node.children[i].nodeName !== "blank"){
			return node.children[i]
		}
	}
}


function addNewListItemNodeToTree(ancestorNode: HtmlNode, listType: string, listItemMarker: string) {
	let newListItemNode: HtmlNode = {parentNode: null, nodeName: "li", indentLevel: -1, closed: false, children: []}
	let parentListNode = null

	if (ancestorNode.children.length > 0 ) {

		let potentialParentList = getLastListNodeChild(ancestorNode)
		if (potentialParentList.infoString === listType && ["ol", "ul"].includes(potentialParentList.nodeName)) {
			parentListNode = potentialParentList
		}
	}
	if (!parentListNode) {
		parentListNode = getListNode(ancestorNode, listType, listItemMarker)
		if (ancestorNode.nodeName === "li"){
			let nearestRootLikeAncestor = getNearestRootlikeAncestor(ancestorNode)
			const lastChildNode = nearestRootLikeAncestor.children[nearestRootLikeAncestor.children.length-1]
			if (lastChildNode.nodeName === "blank"){
				lastChildNode.parentNode = ancestorNode
				ancestorNode.children.push(nearestRootLikeAncestor.children.pop())
			}
		}
		ancestorNode.children.push(parentListNode)
	}else {
		let nearestRootLikeAncestor = getNearestRootlikeAncestor(parentListNode)
		const lastChildNode = nearestRootLikeAncestor.children[nearestRootLikeAncestor.children.length-1]
		if (lastChildNode.nodeName === "blank"){
			lastChildNode.parentNode = parentListNode
			parentListNode.children.push(nearestRootLikeAncestor.children.pop())
		}
	}
	newListItemNode.parentNode = parentListNode;

	parentListNode.children.push(newListItemNode)
	return newListItemNode
}

function addIndentedCodeNode(textTokens: string[], contentStartIndex: number, parentNode: HtmlNode) {
	let lastOpenedChildNode = null;
	let childrenLen = parentNode.children.length

	if (childrenLen > 0){
		lastOpenedChildNode = parentNode.children[childrenLen-1]
		if (lastOpenedChildNode.nodeName !== "indented code block") {
			if (getInnerMostOpenParagraphNode(parentNode)) {
				return "plain text"
			}
		}
	}
	parentNode.children.push(
		{parentNode: parentNode, nodeName: "indented code block", closed: false, textContent: joinText(textTokens, 0).slice(parentNode.indentLevel+4), children: []}
	)
	return "indented code block"
}

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
				else
					lastOpenedChildNode.textContent += '\n'
			}else
				lastOpenedChildNode.textContent += joinText(textTokens, 0).slice(parentNode.indentLevel+4)
			return true
		}else return false
	}
	return false
}


function addOrUpdateParagraphNode(textTokens: string[], lastOpenedAncestor: HtmlNode, contentStartIndex: number) {
	let continuedParagraph = getInnerMostOpenParagraphNode(lastOpenedAncestor)
	if (continuedParagraph) {
		continuedParagraph.textContent += joinText(textTokens, contentStartIndex).trimStart();
	}else {
		let blockType = "paragraph"
		let infoString = ""
		let content = joinText(textTokens, 0).slice(lastOpenedAncestor.indentLevel)
		const textIsHtmlBlock7 = checkIfTextIsHTMLBlock7(content)
		if (textIsHtmlBlock7){
			blockType = "html block"
			infoString = "html block type 7"
		}
		lastOpenedAncestor.children.push(
			{parentNode: lastOpenedAncestor, nodeName: blockType, infoString, closed: false, children: [], textContent: joinText(textTokens, contentStartIndex)}
		)
		return true
	}
	return false
}

function addSetextHeaderNode(headerParentNode: HtmlNode, headerType: string, linkRefsMap: LinkRefDataMap) {
	let paragraphBeforeLine = null
	if (headerParentNode.children.length > 0 && headerParentNode.children[headerParentNode.children.length-1].nodeName === "paragraph") {
		paragraphBeforeLine = headerParentNode.children[headerParentNode.children.length-1]
	}
	if (paragraphBeforeLine && !paragraphBeforeLine.closed) {
		let newText = extractLinkRefsData(paragraphBeforeLine.textContent.trim(), linkRefsMap);
		if (newText) {
			paragraphBeforeLine.nodeName = headerType === "setext header h1" ? "h1" : "h2"
			paragraphBeforeLine.textContent = newText;
			paragraphBeforeLine.closed = true
		}else {
			return null
		}			
		return paragraphBeforeLine

	}
	return null
}

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

function addNonParagraphLeafBlockNode(
	potentialBlockType: string, containerParentNode: HtmlNode, textTokens: string[], leafBlockStartIndex: number, lastWhiteSpaceChunk: string, linkRefsMap: LinkRefDataMap,
	lineIsAThematicBreak: boolean) {
	if (potentialBlockType && potentialBlockType.startsWith("fenced code")) {
		const codeBlockNode = getFencedCodeBlockNode(textTokens, leafBlockStartIndex)
		if (codeBlockNode) {
			codeBlockNode.parentNode = containerParentNode;
			codeBlockNode.indentLevel = containerParentNode.indentLevel + lastWhiteSpaceChunk.length
			containerParentNode.children.push(codeBlockNode)
			return codeBlockNode;
		}else {
			return null
		}
	}else if (potentialBlockType && potentialBlockType.startsWith("setext header")) {
		const nodeAdded = addSetextHeaderNode(containerParentNode, potentialBlockType, linkRefsMap)
		if (nodeAdded) // valid setext header and not possiblya thematic break
			return nodeAdded
	}

	if (lineIsAThematicBreak) {
		containerParentNode.children.push({parentNode: containerParentNode, nodeName: "hr", closed: true, children: []});
		return containerParentNode.children[containerParentNode.children.length-1]
	}

	if (potentialBlockType === "header") {
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


function getLastUnclosedContainerChild(node: HtmlNode): HtmlNode {
	let lastChildNode = null
	if (node.children && node.children.length > 0)
		lastChildNode = node.children[node.children.length-1];

	if (!node.closed && lastChildNode && ["li", "ul", "ol", "blank"].includes(lastChildNode.nodeName)){
		if (lastChildNode.nodeName === "blank" && node.children.length > 0)
			return getLastUnclosedContainerChild(node.children[node.children.length-2])
		return getLastUnclosedContainerChild(node.children[node.children.length-1])
	}else {
		return node
	}
}


function addBlockNodesToTree(lastOpenedContainerNode: HtmlNode, textTokens: string[], linkRefsMap: LinkRefDataMap) {
	let tokenEndIndex = -1
	let tokenStartIndex = -1
	let nearestOpenedAncestor = null
	let lastWhiteSpaceChunk = ""
	let lineIsAThematicBreak = false
	let lineIsBlank = false
	let outerMostBlockQuoteNode = null

	for (let i=0;i<textTokens.length;i++) {
		const text = textTokens[i];
		tokenStartIndex = tokenEndIndex + 1

		if ((/\s/).test(text[0])){
			if (i === textTokens.length-1 && (textTokens.length === 1 || nearestOpenedAncestor?.nodeName === "blockquote")){
				lineIsBlank = true
			}else {
				lastWhiteSpaceChunk = replaceTabsWithSpaces(text, tokenEndIndex+1)
				textTokens[i] = lastWhiteSpaceChunk // prevents bugs when slicing content
				tokenEndIndex += lastWhiteSpaceChunk.length // We want indent level to be the last space character index by design
				continue;
			}
		}

		if (nearestOpenedAncestor && nearestOpenedAncestor.nodeName === "blockquote"){
			lastOpenedContainerNode = getLastUnclosedContainerChild(nearestOpenedAncestor)
			nearestOpenedAncestor = null;
		}

		
		tokenEndIndex += text.length;
		if (!nearestOpenedAncestor && !lineIsBlank){
			nearestOpenedAncestor = getNearestOpenedAncestor(lastOpenedContainerNode, tokenStartIndex)
		}

		if (lineIsBlank){
			if (!nearestOpenedAncestor)
				nearestOpenedAncestor = lastOpenedContainerNode;
			const containerNodeBeforeBlankLine = closeLeafNodeTerminatedByBlankLine(nearestOpenedAncestor, tokenStartIndex);
			if (containerNodeBeforeBlankLine) {
				nearestOpenedAncestor = containerNodeBeforeBlankLine
				break;
			}
		}


		let childrenLen = nearestOpenedAncestor.children.length

		if (childrenLen > 0){
			let lastOpenedChildNode = nearestOpenedAncestor.children[childrenLen-1]
			if (lastOpenedChildNode.nodeName.startsWith("fenced code") && !lastOpenedChildNode.closed){
				if ((tokenStartIndex - nearestOpenedAncestor.indentLevel) < 4 && lineEndsFencedCodeBlock(lastOpenedChildNode, textTokens, i)) {
					lastOpenedChildNode.closed = true
				}else{
					continueFencedCodeBlockContent(textTokens, lastOpenedChildNode, nearestOpenedAncestor)
				}
				break;
			}else if (lastOpenedChildNode.nodeName === "html block" && !lastOpenedChildNode.closed){
				if (!lineIsBlank || !["html block type 6", "html block type 7"].includes(lastOpenedChildNode.infoString)) {
					const content = joinText(textTokens, 0).slice(nearestOpenedAncestor.indentLevel)
					if (htmlBlockEnded(lastOpenedChildNode.infoString, content)){
						lastOpenedChildNode.closed = true
					}
					lastOpenedChildNode.textContent += content
					break;
				}
			}
		}

		let potentialBlockType = null
		let newLeafNodeCreated = false

		if ((nearestOpenedAncestor?.indentLevel !== undefined && (tokenStartIndex - nearestOpenedAncestor.indentLevel) >= 4) || lineIsBlank){
			const contentUpdated = updateIndentedCodeNodeContent(textTokens, i, nearestOpenedAncestor, lineIsBlank)
			if (contentUpdated) {
				break;
			}

			if (!lineIsBlank) {
				const actualContentType = addIndentedCodeNode(textTokens, i, nearestOpenedAncestor)
				if (actualContentType === "indented code block"){
					newLeafNodeCreated = true
				}else potentialBlockType = actualContentType;
			}
			
		}else potentialBlockType = getLeafBlockType(textTokens, i);

		if (!newLeafNodeCreated && potentialBlockType !== "plain text"){
			const newNode = addNonParagraphLeafBlockNode(
				potentialBlockType, nearestOpenedAncestor, textTokens, i, lastWhiteSpaceChunk, linkRefsMap, lineRepsThematicBreak(textTokens, i)
			)
			newLeafNodeCreated = true
			if (!newNode){
				potentialBlockType = "indeterminate"
				newLeafNodeCreated = false
			}
			newLeafNodeCreated = Boolean(newNode)
		}
		
		let containerType:string = null
		if (!newLeafNodeCreated && potentialBlockType === "indeterminate")
			containerType = getContainerBlockType(text)

		if (containerType && containerType !== "blockquote"){
			if (!markerRepsValidListItem(textTokens, i, containerType, nearestOpenedAncestor)) {
				containerType = "plain text"
			}
		}

		if (containerType === "blockquote") {
			const childLen = nearestOpenedAncestor.children.length;
			if (nearestOpenedAncestor.children.length > 0){

				const lastChildNode = nearestOpenedAncestor.children[childLen-1]
				if (lastChildNode.nodeName === "blockquote" && !lastChildNode.closed){
					nearestOpenedAncestor = nearestOpenedAncestor.children[0] // why index 0?
					// nearestOpenedAncestor.infoString = i.toString()
					tokenStartIndex = 0;
					tokenEndIndex = 0
					nearestOpenedAncestor.indentLevel = 1;
					
					if (i<textTokens. length-1 && (/\s/).test(textTokens[i+1][0])) {
						nearestOpenedAncestor.indentLevel += 1;
					}
					
					if (!outerMostBlockQuoteNode)
						outerMostBlockQuoteNode = nearestOpenedAncestor;
					continue;
				}
			}

			tokenStartIndex = 0;
			tokenEndIndex = 0;

			const newNode: HtmlNode = {
				parentNode: nearestOpenedAncestor, nodeName: "blockquote",indentLevel: 1, closed: false, children: []/*, infoString: i.toString()*/
			};
			if (i<textTokens.length-1 && (/\s/).test(textTokens[i+1][0])) {
				newNode.indentLevel += 1;
			}

			nearestOpenedAncestor.children.push(newNode)
			nearestOpenedAncestor = newNode

			if (!outerMostBlockQuoteNode)
				outerMostBlockQuoteNode = nearestOpenedAncestor;
			continue;
		}else if (containerType && containerType !== "plain text") {
			const newListItemNode = addNewListItemNodeToTree(nearestOpenedAncestor, containerType, textTokens[i])
			if (i === textTokens.length-2) {
				newListItemNode.indentLevel = tokenEndIndex + 2;
			}else if (i < textTokens.length-2) {
				const nextWhitespaceChunk = replaceTabsWithSpaces(textTokens[i+1], tokenEndIndex+1)
				if (nextWhitespaceChunk.length < 5)
					newListItemNode.indentLevel = tokenEndIndex + nextWhitespaceChunk.length + 1;
			}
			if (newListItemNode.indentLevel === -1) {
				newListItemNode.indentLevel = tokenEndIndex + 2;
			}
			newListItemNode.infoString = lastWhiteSpaceChunk + text
			nearestOpenedAncestor = newListItemNode
			continue;
		}

		if (!newLeafNodeCreated && !lineIsBlank){
			newLeafNodeCreated = addOrUpdateParagraphNode(textTokens, nearestOpenedAncestor, i)
			if (!newLeafNodeCreated){ // paragraph continuation line
				nearestOpenedAncestor = lastOpenedContainerNode
				break;
			}
		}
		if (newLeafNodeCreated){
			if (nearestOpenedAncestor.nodeName === "li"){
				let nearestRootLikeAncestor = getNearestRootlikeAncestor(nearestOpenedAncestor)
				const potBlankNode = nearestRootLikeAncestor.children[nearestRootLikeAncestor.children.length-1]
				if (potBlankNode.nodeName === "blank"){
					const newNode = nearestOpenedAncestor.children.pop()
					potBlankNode.parentNode = nearestOpenedAncestor
					nearestOpenedAncestor.children.push(nearestRootLikeAncestor.children.pop(), newNode)
				}
			}
			break;
		}
		lastWhiteSpaceChunk = ""
	}

	if (outerMostBlockQuoteNode) {
		nearestOpenedAncestor = outerMostBlockQuoteNode.parentNode
		outerMostBlockQuoteNode = null
	}
	
	return nearestOpenedAncestor
}


function mergeWithPrevParagraphIfAny1(listItemNode: HtmlNode){
	const listNode = listItemNode.parentNode
	const listNodeParent = listNode.parentNode

	for (let i=0; i<listNodeParent.children.length; i++) {
		const childNode = listNodeParent.children[i]
		if (childNode === listItemNode.parentNode && i !== 0){
			if (listNodeParent.children[i-1].nodeName === "paragraph" && !listNodeParent.children[i-1].closed){
				listNodeParent.children[i-1].textContent += listItemNode.infoString + '\n'
				listItemNode.nodeName = "deleted"
				// console.log(listNodeParent.children[i-1].textContent)
				return listNodeParent
			}else {
				return listItemNode
			}
		}
	}
}


function checkListNodeValidity(listNode: HtmlNode) {
	for (let i=0; i<listNode.children.length; i++) {
		if (listNode.children[i].nodeName == "li"){
			return true
		}
	}
	return false
}

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


function reprocessListItems(node: HtmlNode) {
	if (node.children && node.children.length > 0) {
		for (let i=0; i<node.children.length; i++) {
			let childNode = node.children[i]
			if (childNode.children && childNode.children.length > 0) {
				reprocessListItems(childNode)
			}else if (childNode.nodeName === "li" && (i === 0 || node.children[i-1].nodeName === "deleted")) {
				mergeWithPrevParagraphIfAny1(childNode)
			}else if (node.nodeName === "ol" || node.nodeName === "ul"){
				break;
			}
		}
		if (node.nodeName === "ol" || node.nodeName === "ul") {
			const listIsValid = checkListNodeValidity(node)
			if (!listIsValid){
				node.nodeName = "deleted"
			}else if (listIsLoose(node)){
				node.tight = 'false'
			}
		}
	}
}

export default function generateBlockNodesTree2(textStream: string, linkRefsMap: LinkRefDataMap, dangerousHtml: string[]) {
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
			reprocessListItems(rootNode)
			return rootNode
		}
	}
}

