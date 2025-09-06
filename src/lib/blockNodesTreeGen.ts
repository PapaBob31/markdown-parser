import type {HtmlNode} from "../index"

function lineRepsThematicBreak(textTokens: string[]) {
	let firstNWChar = ""
	let markerCount = 0;

	for (let text of textTokens) {
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
			if (curr_token && !(/\S/).test(curr_token[0])) {
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

function continueLastOpenedNodeContent(lastOpenedNode: HtmlNode, textTokens: string[]) {
	if (lastOpenedNode.nodeName === "indented code block"){
		return false
	}else if (lastOpenedNode.nodeName.startsWith("fenced code")) {
		return false
	}
}


function getATXHeaderContent(textTokens: string[]) {
	let content = ""
	let startTokenIndex = -1;

	for (let i=0; i<textTokens.length; i++) {
		if (content && textTokens[i][0] === "#") {
			const lti = textTokens.length-1 // lastTokenIndex
			if (i === lti && (/\s/).test(textTokens[i-1][0])) {
				content = content.trim()
				break;
			}else if (i === lti-1 && (/\s/).test(textTokens[i-1][0]) && (/\s/).test(textTokens[i+1][0])) {
				content = content.trim()
				break;
			}
		}

		if (!content && !(/\s|#/).test(textTokens[i][0])){
			content += textTokens[i]
		}
	}

	return content 

}

function getNearestUnclosedAncestor(lastOpenedNode: HtmlNode, indentLevel: number): HtmlNode {
	if (lastOpenedNode.indentLevel && (lastOpenedNode.indentLevel < indentLevel)) {
		if (["ul", "ol"].includes(lastOpenedNode.nodeName))
			return lastOpenedNode.parentNode
		return lastOpenedNode
	}
	return getNearestUnclosedAncestor(lastOpenedNode.parentNode, indentLevel)

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
			potentialType = "h1"
		}else if (i === startIndex && (/^-+$/).test(textTokens[i])){
			potentialType = "h2"
		}else if (!(/\s/).test(textTokens[i][0]) || i != textTokens.length-1) {
			return null
		}
	}
	
	return potentialType
}



function getInnerMostOpenParagraphNode(rootNode: HtmlNode): null|HtmlNode {
	if (rootNode.nodeName === "paragraph") {
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
	if (["root", "li"].includes(currNode.nodeName) && currNode.indentLevel <= indentLvl){
		if (!currNode.closed)
			return currNode
	}

	return getNearestOpenedAncestor(currNode.parentNode, indentLvl)

}

function getContainerBlockType(marker: string) {
	if (marker === ">"){
		return "blockquote"
	}else if ("-+*".includes(marker)) {
		return "list item " + marker
	}else if ((/^\d{1,9}(?:\.|\))$/).test(marker)){
		if (marker[marker.length-1] === ".")
			return "list item n."
		return "list item n)"
	}
	return null
}




function getListNode(listNodeParent: HtmlNode, markerDetails: string) {
	const listNode: HtmlNode = {
		parentNode: listNodeParent,
		nodeName: "",
		closed: false, 
		children: [],
		tight: "true",
		indentLevel: listNodeParent.indentLevel
	}

	if (["list item +", "list item -", "list item *"].includes(markerDetails)){
		listNode.nodeName = "ul"
	}else {
		listNode.nodeName = "ol"
	}

	listNode.infoString = markerDetails

	return listNode
}



/** The Common Mark spec defines 7 types of html block
 * Returns the type of html block that the line parameter starts */ 
function getHtmlBlockType(text: string) {
	let newNode: HtmlNode;
	// let htmlPatterns = text.match(/\s*(<!--)(?!(?:>|->))/) || text.match(/<([^<\s>][^\s>]*)/);
	let htmlPatterns = text.match(/^(<!--)(?!(?:>|->))/) || text.match(/^<([^<\s>]+)/);
	let type6Tags = ["address", "article", "aside", "base", "basefont", "blockquote", "body", "caption", 
					"center", "col", "colgroup", "dd", "details", "dialog", "dir", "div", "dl", "dt", "fieldset", 
					"figcaption", "figure", "footer", "form", "frame", "frameset", "h1", "h2", "h3", "h4", "h5", 
					"h6", "head", "header", "hr", "html", "iframe", "legend", "li", "link", "main", "menu", 
					"menuitem", "nav", "noframes", "ol", "optgroup", "option", "p", "param", "section", "source", 
					"summary", "table", "tbody", "td", "tfoot", "th", "thead", "title", "tr", "track", "ul",]
	if (!htmlPatterns) {
		return null
	}/*else if (dangerousHtmlTags.includes(htmlPatterns[1].toLowerCase())) {
		return null
	}*/
	if (htmlPatterns[1] === "<!--") {
		return "html block type 1"
	}else {
		if (htmlPatterns[1].slice(0, 2) === "<?") {
			return "html block type 2"
		}else if (htmlPatterns[1].slice(0, 8) === "![CDATA[") {
			return "html block type 3"
		}else if (htmlPatterns[1].slice(0, 2) === "!") {
			return "html block type 4"
		}else if (["script", "pre", "style"].includes(htmlPatterns[1].toLowerCase())) {
			return "html block type 5"
		}else if (type6Tags.includes(htmlPatterns[1].toLowerCase())) {
			return "html block type 6"
		}else return null
	}
}

function htmlBlockEnded(blockType: string, line: string) {
	switch (blockType) {
		case "html block type 1": // html comments
			return line.includes("-->")
		case "html block type 2":
			return line.includes("?>")
		case "html block type 3": // CDATA
			return line.includes("]]>")
		case "html block type 4": // declarartion types e.g <!DOCTYPE html>
			return line.includes(">")
		case "html block type 5": // script, pre and style tags
			return (/<(?:\/script>)|(?:\/pre>)|(?:\/style>)/i).test(line);
	}
	return false;
}

function getLeafBlockType(marker: string) {
	if ((/^#+$/).test(marker)) {
		if (marker.length <= 6)
			return "header"
		return "plain text"
	}else if (marker[0] === '`') {
		return "fenced code backtick"
	}else if (marker[0] === '~') {
		return "fenced code tilde"
	}else if (marker[0] === "=" || marker[0] === "-") {
		return "setext header"
	}
	const htmlBlockType = getHtmlBlockType(marker)
	if (htmlBlockType)
		return htmlBlockType
	else return "plain text"
}


function getFirstWord(text: string) {
	const punctuations = "!#$%&'()*+,-./:;<=>?@,[\\]^_`,{|}~"	
	let firstWord = ""
	
	for (let char of text) {
		if (punctuations.includes(char) || (/\s/).test(char)) {
			return firstWord
		}
		firstWord += char
	}
	return firstWord;
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
			newNode.infoString = getFirstWord(textTokens[i])
		}

		const nodeIsFencedWithBacktick = (newNode.nodeName === "fenced code backtick")
		const nodeIsFencedWithTilde = (newNode.nodeName === "fenced code tilde")
		if (nodeIsFencedWithBacktick && textTokens[i][0] === "`" || nodeIsFencedWithTilde && textTokens[i][0] === '~') {
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

function textStartsWithClosingTag(text: string) {
	let possibleClosingTagPatterns = text.match(/^\s*<\/[a-zA-z-][a-zA-Z0-9-]+(\s*)>\n/);
	let newLineCharFoundPrev = false

	if (!possibleClosingTagPatterns)
		return false

	let whiteSpace = possibleClosingTagPatterns[1]

	for (let i=0; i<whiteSpace.length; i++){
		let char = whiteSpace[i]

		if (char === '\n' && newLineCharFoundPrev){
			return false
		}else if (char === '\n' && !newLineCharFoundPrev) {
			newLineCharFoundPrev = true
		}
	}

}


/*
links
code spans
raw html
autolinks
*/

function textStartsWithOpeningTag(text: string) {
	let partBeingProcessed = ""
	let finishedProcessing =  false
	let newLineCharFoundPrev = false
	let completeTag = false

	const possComponentsBeforeAttribute = ["tag name", "single quoted val", "double quoted val", "unquoted val", "attribute name"]

	for (let i=0; i<text.length; i++) {
		let char = text[i]
		if (completeTag && !(/\s/).test(char))
			return false
		else if (completeTag && char === '\n')
			break;

		if (!["single quoted val", "double quoted val"].includes(partBeingProcessed) && (/\s/).test(char)) {
			if (char === '\n' && newLineCharFoundPrev){
				return false
			}else if (char === '\n' && !newLineCharFoundPrev) {
				newLineCharFoundPrev = true
			}
			if (!finishedProcessing) {
				finishedProcessing = true
			}
			continue
		}

		if (!partBeingProcessed) {
			if (char === '<')
				partBeingProcessed = "start delimiter"
			else
				return false;
		}else if (partBeingProcessed === "start delimiter" && (/[a-zA-z-]/).test(char)) {
			if (finishedProcessing) // white space after '<'? 
				return false // NO!!
			partBeingProcessed = "tag name"
		}else if (partBeingProcessed === "tag name" && !(/[a-zA-Z0-9-]/).test(char)) {
			return false
		}else if (possComponentsBeforeAttribute.includes(partBeingProcessed) && finishedProcessing && (/[a-zA-Z_:]/).test(char)) {
			partBeingProcessed = "attribute name"
		}else if (partBeingProcessed === "attribute name" && char === "=") {
			partBeingProcessed = "assignment operator"
		}else if (partBeingProcessed === "attribute name" && !(/[a-zA-Z0-9_:.]/).test(char)) {
			return false
		}else if (partBeingProcessed === "assignment operator" && !(/[=<>`]/).test(char)) {
			if (char === "'")
				partBeingProcessed = "single quoted val"
			else if (char === '"')
				partBeingProcessed = "double quoted val"
			else
				partBeingProcessed = "unquoted val"
		}else if (partBeingProcessed === "single quoted val" && char === "'" && !finishedProcessing) {
			finishedProcessing = true
			continue;
		}else if (partBeingProcessed === "double quoted val" && char === '"' && !finishedProcessing) {
			finishedProcessing = true
			continue;
		}else if (partBeingProcessed === "unquoted val" && (/"|'|=|<|>|`|/).test(char)) {
			return false
		}else if (partBeingProcessed !== "assignment operator" && finishedProcessing) {
			if (i <= text.length-2 && char === '/' && text[i+1] === '>'){
				completeTag = true
			}else if (char === '>') {
				completeTag = true
			}
		}

		if (finishedProcessing) {
			newLineCharFoundPrev = false
			finishedProcessing = false
		}
	}

	if (completeTag)
		return true
	return false
}


function checkIfTextIsHTMLBlock7(text: string) {
	if (textStartsWithClosingTag(text) || textStartsWithOpeningTag(text)) {
		return true
	}
	return false
}

function listIsLoose(listNode: HtmlNode): boolean {

	for (let i=0; i<listNode.children.length; i++) {
		let listItemNode = listNode.children[i]
		if (i !== listNode.children.length-1) {
			if (listItemNode.children[listItemNode.children.length-1] && listItemNode.children[listItemNode.children.length-1].nodeName === "blank"){
				return true
			}
		}

		for (let j=1; j<listItemNode.children.length-1; j++) {
			if (listItemNode.children[j].nodeName === "blank")
				return true				
		}

	}
	return false

}


// what if it's an empty string?
function addBlockNodesToTree(lastOpenedContainerNode: HtmlNode, textTokens: string[]) {
	let indentLevel = -1
	let nearestOpenedAncestor = null
	let leafBlockStartIndex = -1
	let lastWhiteSpaceChunk = ""
	let lineIsAThematicBreak = false
	let lineIsBlank = false
	let outerMostBlockQuoteNode = null
	let terminalNode = null

	for (let i=0;i<textTokens.length;i++) {
		const text = textTokens[i];

		if ((/\s/).test(text[0])){
			if (textTokens.length == 1){
				lineIsBlank = true
				break;
			}

			lastWhiteSpaceChunk = replaceTabsWithSpaces(text, indentLevel+1)
			textTokens[i] = lastWhiteSpaceChunk // prevents  bugs when slicing content
			indentLevel += lastWhiteSpaceChunk.length // We want indent level to be the last space character index by design
			if (nearestOpenedAncestor && nearestOpenedAncestor.nodeName === "blockquote")
				nearestOpenedAncestor.indentLevel += 1;
		}else {
			if (!nearestOpenedAncestor){
				indentLevel++;
				nearestOpenedAncestor = getNearestOpenedAncestor(lastOpenedContainerNode, indentLevel)
			}

			if (nearestOpenedAncestor.children.length > 0) {
				const lastChild = nearestOpenedAncestor.children[nearestOpenedAncestor.children.length-1]

				if (lastChild.nodeName.startsWith("fenced code") || lastChild.nodeName.startsWith("html block")) {
					leafBlockStartIndex = i;
					break;
				}

			}

			if (nearestOpenedAncestor && nearestOpenedAncestor.nodeName === "li") {
				if (nearestOpenedAncestor.children.length == 0 && lastWhiteSpaceChunk.length < 4){
					nearestOpenedAncestor.indentLevel += (-1 + lastWhiteSpaceChunk.length)
				}
			}

			if (nearestOpenedAncestor?.indentLevel !== undefined && (indentLevel - nearestOpenedAncestor.indentLevel) >= 4) {
				leafBlockStartIndex = i;
				break;
			}

			if (lineRepsThematicBreak(textTokens)){
				lineIsAThematicBreak = true;
				break;
			}

			const containerType = getContainerBlockType(text)

			if (!containerType) {
				leafBlockStartIndex = i;
				break;
			}

			if (containerType.startsWith("list item")) {
				if (i !== textTokens.length-1 && !(/\s/).test(textTokens[i+1][0])) {
					leafBlockStartIndex = i;
					break;
				}
				let newListItemNode: HtmlNode = {parentNode: null, nodeName: "li", indentLevel: -1, closed: false, children: []}
				let parentListNode = null

				if (nearestOpenedAncestor.children.length > 0 ) {
					const potentialParentList = nearestOpenedAncestor.children[nearestOpenedAncestor.children.length-1]

					if (potentialParentList.nodeName === "paragraph") {
						if (i === textTokens.length-1 || (i === textTokens.length-2 && (/\s/).test(textTokens[i+1][0]))) {
							leafBlockStartIndex = i;
							break;
						}
					}
					if (potentialParentList.infoString === containerType && ["ol", "ul"].includes(potentialParentList.nodeName)) {
						parentListNode = potentialParentList
					}
				}
				if (!parentListNode) {
					// console.log('okay')
					parentListNode = getListNode(nearestOpenedAncestor, containerType)
					nearestOpenedAncestor.children.push(parentListNode)
				}
				newListItemNode.parentNode = parentListNode;
				newListItemNode.indentLevel = indentLevel + (text.length-1) + 2
				parentListNode.children.push(newListItemNode)
				nearestOpenedAncestor = newListItemNode


			}else if (containerType === "blockquote") {
				const childLen = nearestOpenedAncestor.children.length;
				if (nearestOpenedAncestor.children.length > 0){
					const lastChildNode = nearestOpenedAncestor.children[childLen-1]
					if (lastChildNode.nodeName === "blockqote" && !lastChildNode.closed){
						nearestOpenedAncestor = nearestOpenedAncestor.children[0]
						continue;
					}
				}
				const newNode: HtmlNode = {parentNode: nearestOpenedAncestor, nodeName: "blockquote",indentLevel: nearestOpenedAncestor.indentLevel+1,closed: false, children: []};
				nearestOpenedAncestor.children.push(newNode)
				nearestOpenedAncestor = newNode

				if (!outerMostBlockQuoteNode)
					outerMostBlockQuoteNode = nearestOpenedAncestor;
			}
		}
	}
	

	let containerParentNode = null
	if (!nearestOpenedAncestor) {
		containerParentNode = lastOpenedContainerNode
	}else{
		if (nearestOpenedAncestor.nodeName === "blockquote") {
			if (leafBlockStartIndex === -1){
				lineIsBlank = true
			}
		}
		containerParentNode = nearestOpenedAncestor
	}

	let childrenLen = containerParentNode.children.length

	if (childrenLen > 0){
		let lastOpenedChildNode = containerParentNode.children[childrenLen-1]
		if (lastOpenedChildNode.nodeName.startsWith("fenced code")){
			if (lineEndsFencedCodeBlock(lastOpenedChildNode, textTokens, leafBlockStartIndex)) {
				lastOpenedChildNode.closed = true
			}else
				lastOpenedChildNode.textContent += joinText(textTokens, leafBlockStartIndex)
			return containerParentNode
		}else if (lastOpenedChildNode.nodeName.startsWith("html block")){
			const content = joinText(textTokens, leafBlockStartIndex)
			lastOpenedChildNode.textContent += content
			if (htmlBlockEnded(lastOpenedChildNode.infoString, content))
				lastOpenedChildNode.closed = true

			return containerParentNode

		}

	}

	let textToken = null
	let potentialBlockType = null

	if (!lineIsBlank && leafBlockStartIndex > -1) {
		textToken = textTokens[leafBlockStartIndex];
		if (nearestOpenedAncestor?.indentLevel !== undefined && (indentLevel - nearestOpenedAncestor.indentLevel) >= 4)
			potentialBlockType = "indented code block"
		else
			potentialBlockType = getLeafBlockType(textToken);
	}


	if (nearestOpenedAncestor?.indentLevel !== undefined && (indentLevel - nearestOpenedAncestor.indentLevel) >= 4) {

		let lastOpenedChildNode = null;

		if (childrenLen > 0){
			lastOpenedChildNode = containerParentNode.children[childrenLen-1]
			if (lastOpenedChildNode.nodeName === "indented code block") {
				lastOpenedChildNode.textContent += joinText(textTokens, 0).slice(containerParentNode.indentLevel+4)
			}else {
				let continuedParagraph = getInnerMostOpenParagraphNode(containerParentNode)
				if (continuedParagraph)
					potentialBlockType = "plain text"
				else {
					containerParentNode.children.push(
						{parentNode: containerParentNode, nodeName: "indented code block", closed: false, textContent: joinText(textTokens, 0).slice(containerParentNode.indentLevel+4), children: []}
					)
				}
			}
		}else {
			containerParentNode.children.push(
				{parentNode: containerParentNode, nodeName: "indented code block", closed: false, textContent: joinText(textTokens, 0).slice(containerParentNode.indentLevel+4), children: []}
			)
		}
	}

	if (lineIsAThematicBreak) {
		containerParentNode.children.push({parentNode: containerParentNode, nodeName: "hr", closed: true, children: []});
		return containerParentNode;
	}


	if (lineIsBlank){
		let nodeAffectedByBlankLine = containerParentNode;
		
		while (true) {
			const childrenLen = nodeAffectedByBlankLine.children.length
			if (childrenLen === 0) {
				break;
			}
			let lastChildNode = nodeAffectedByBlankLine.children[childrenLen-1]
			
			if (lastChildNode.parentNode.nodeName === "li") {
				if (lastChildNode.nodeName !== "blank"){
					if (lastChildNode.parentNode.children.length === 0)
						lastChildNode.parentNode.closed = true // list item can't start with more than one blank line
					lastChildNode.parentNode.children.push({parentNode: lastChildNode.parentNode, nodeName: "blank", closed: true, children: []})
				}
			}
			if (["paragraph", "html block type 6", "html block type 7",  "blockquote"].includes(lastChildNode.nodeName)) {
				lastChildNode.closed = true
			}

			if (lastChildNode.closed)
				break;

			nodeAffectedByBlankLine = lastChildNode;
		}

		return containerParentNode;

	}

	if (potentialBlockType.startsWith("fenced code")) {
		const codeBlockNode = getFencedCodeBlockNode(textTokens, leafBlockStartIndex)
		if (codeBlockNode) {
			codeBlockNode.parentNode = containerParentNode;
			containerParentNode.children.push(codeBlockNode)
			return containerParentNode;
		}else {
			potentialBlockType = "plain text"
		}
	}else if (potentialBlockType === "setext header") {
		let paragraphBeforeLine = getInnerMostOpenParagraphNode(containerParentNode)
		if (paragraphBeforeLine) {
			const headerType = getSetextHeaderType(textTokens, leafBlockStartIndex);
			if (headerType) {
				paragraphBeforeLine.nodeName = headerType
				paragraphBeforeLine.closed = true
			}else {
				potentialBlockType = "plain text"
			}	
		}else {
			potentialBlockType = "plain text"
		}
	}  
			

	if (potentialBlockType == "plain text") {
		let continuedParagraph = getInnerMostOpenParagraphNode(containerParentNode)
		if (continuedParagraph) {
			continuedParagraph.textContent += joinText(textTokens, leafBlockStartIndex)
		}else {
			let blockType = "paragraph"
			let content = joinText(textTokens, 0).slice(containerParentNode.indentLevel)
			const textIsHtmlBlock7 = checkIfTextIsHTMLBlock7(content)
			if (textIsHtmlBlock7){
				blockType = "html block type 7"
			}
			containerParentNode.children.push(
				{parentNode: containerParentNode, nodeName: blockType, closed: false, children: [], textContent: joinText(textTokens, leafBlockStartIndex)}
			)
		}
	}else if (potentialBlockType === "header") {
		containerParentNode.children.push(
			{parentNode: containerParentNode, nodeName: `h${textToken.length}`, closed: true, children: [], textContent: getATXHeaderContent(textTokens)}
		)
	}else if (potentialBlockType.startsWith("html block")) {
		containerParentNode.children.push(
			{parentNode: containerParentNode, nodeName: "html block", closed: false, textContent: joinText(textTokens, leafBlockStartIndex), infoString: potentialBlockType, children: []}
		)
	}
	if (outerMostBlockQuoteNode) {
		containerParentNode = outerMostBlockQuoteNode.parentNode
		outerMostBlockQuoteNode = null
	}

	if (containerParentNode.nodeName === "li"){
		if (containerParentNode.parentNode.tight === "true" && listIsLoose(containerParentNode.parentNode))
			containerParentNode.parentNode.tight = "false"; // change to boolean type later since we are sure now
	}
	return containerParentNode

}


export default function generateBlockNodesTree2(textStream: string, dangerousHtml: string[]) {
	let i = 0;
	let rootNode:HtmlNode = {parentNode: null as any, nodeName: "root", indentLevel: 0, closed: false, children: []};
	let lastOpenedNode = rootNode;

	while (true) {
		let lineTokens: string[] = [];
		[lineTokens, i] = tokenizeLine(textStream, i);
		i++;
		lastOpenedNode = addBlockNodesToTree(lastOpenedNode, lineTokens)

		if (i >= textStream.length-1)
			return rootNode
	}
}
