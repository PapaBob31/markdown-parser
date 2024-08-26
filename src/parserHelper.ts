import type {HtmlNode} from "./index"
import {lineIsHorizontalRule} from "./utilities"

interface LinkRef {
	label: string;
	destination: string;
	title: string
}

const PUNCTUATIONS = "<>;,.()[]{}!`~+-*&^%$#@\\/\"':?~|"; // is this all the possible punctuations?

export function generateHtml(rootNode: HtmlNode, indentLevel: number, linkRefs: LinkRef[]):string {
	let text = "";
	const whiteSpace = ' '.repeat(indentLevel);
	if (rootNode.nodeName === "paragraph" || (/h[1-6]/).test(rootNode.nodeName)) {
		rootNode.textContent = parseInlineNodes(rootNode.textContent as string, linkRefs);
	}
	if (rootNode.nodeName === "html block") {
		text = `${whiteSpace}${rootNode.textContent}\n`
	}else if (rootNode.nodeName === "paragraph") {
		text = rootNode.textContent ? `${whiteSpace}<p>${rootNode.textContent}</p>\n` : ""// TODO: Don't nest inside paragraphs if paragraph is only comment
	}else if (rootNode.nodeName === "fenced code" || rootNode.nodeName === "indented code block") {
		text = `${whiteSpace}<pre class=${rootNode.infoString || ""}>\n${whiteSpace+'  '}<code>${rootNode.textContent}\n${whiteSpace+'  '}</code>\n${whiteSpace}</pre>\n`
	}else if (["hr"].includes(rootNode.nodeName)) {
		text = `${whiteSpace}<${rootNode.nodeName}>\n`
	}else {
		if (rootNode.nodeName === "ol") {
			text = `${whiteSpace}<${rootNode.nodeName} start="${rootNode.startNo}">\n`	
		}else text = `${whiteSpace}<${rootNode.nodeName}>\n`;

		if (rootNode.nodeName === "li" && rootNode.children.length === 1) {
			let onlyChild = rootNode.children[rootNode.children.length-1];
			if (onlyChild.nodeName === "paragraph" && !(onlyChild.textContent as string).includes('\n')) {
				text += onlyChild.textContent;
			}else text += `${generateHtml(onlyChild, indentLevel+2, linkRefs)}`;
		}else if (rootNode.children.length >= 1){
			for (const childNode of rootNode.children) {
				text += `${generateHtml(childNode, indentLevel+2, linkRefs)}`;
			}
		}else if (!rootNode.children.length) text += rootNode.textContent;
		text += `${whiteSpace}</${rootNode.nodeName}>\n`
	}
	return text;
}

export function getBlockNodes(line: string): [string, number] {
	let nodeName;
	let markerPos = line.slice(0,4).indexOf('>');

	if (markerPos > -1) {
		nodeName = "blockquote"
	}else if ((/\s*#{1,6}\s/).test(line)) {
		markerPos = line.indexOf('#')
		nodeName = "header"
	}else if ((/^\s*`{3,}[^`]*$/).test(line)) {
		markerPos = line.indexOf('`');
		nodeName = "fenced code";
	}else if (lineIsHorizontalRule(line)){ // hr
		nodeName = "hr";
		markerPos = line.search(/\S/)
	}else if ((markerPos = line.search(/<\/?(?:\w|\d)./)) !== -1) {
		nodeName = "html block"; // possibly
	}else {
		let listMarkerDetails = (/^(\s*)(\d{1,9}(?:\.|\)))(\s+)/).exec(line) || (/^(\s*)(-|\+|\*)(\s+)/).exec(line);
		if (listMarkerDetails) {
			markerPos = listMarkerDetails[1].length;
			if (("+-*").includes(listMarkerDetails[2])) {
				nodeName = "ul-li"
			}else nodeName = "ol-li";
		}else {
			nodeName = "plain text";
			markerPos = line.search(/\S/);
		};
	}
	
	return [nodeName, markerPos];
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

// gets the end index of an html tag
// Perhaps, It could be done better with the kmp or boyer-moore algorithm if only I knew how to implement them
// TODO: add support for html comments. You've even started
function getHtmlTagEndPos(tagStartIndex: number, str: string): number {
	let currTokenType = "";
	let lastToken = ""
	let attrValueFirstChar = ""; // HTML attribute value first character
	for (let i=tagStartIndex+1; i<str.length; i++) {
		if ((i==tagStartIndex+1) && !(/[a-zA-Z]/).test(str[i])) { // An ASCII alphabet must start an html tag
			return -1
		}else {
			currTokenType = "tag name"
		}

		if ((currTokenType === "" || currTokenType === "white space") && str[i] === '>') {
			return i;
		}

		if (currTokenType === "attr value" && ('"\'').includes(attrValueFirstChar)) { // html attribute quoted value
			if (str[i] === attrValueFirstChar && ( (i+1 === str.length) || !(" />").includes(str[i+1])) ) {
				// syntax violates html syntax spec which states quoted attribute values must be seperated from a new attribute by whitespace
				return -1;
			}else currTokenType = "";
		}

		if ((/\s/).test(str[i]) && currTokenType !== "white space") {
			lastToken = currTokenType;
			currTokenType = "white space";			
		}else if (!(/\s/).test(str[i]) && currTokenType === "white space") {
			if (str[i] === "/") {
				currTokenType = "solidus"
			}else if (lastToken === "tag name" || lastToken === "attr name") {
				if ( ("<>\"'=").includes(str[i]) ) {
					return -1;
				}else currTokenType = "attr name"
			}else if (lastToken === "attr name" && str[i] === '=') {
				currTokenType = "value specifier"
				continue; // prevents lastToken from becoming a null string
			}else if (lastToken === "value specifier") {
				currTokenType = "attr value"
			}
			lastToken = "";
		}
	}
	return -1;
}

function getAutoLinkStr(startIndex: number, text: string) {
	let matchedPattern = text.slice(startIndex).match(/<[a-zA-Z]{2,32}:\S*>/)
	if (!matchedPattern) {
		return "";
	}
	return matchedPattern[0];
}

interface Node {
	content: string;
	type: string;
	closed: boolean;
	next: Node|null;
	prev: Node|null;
}

function addOrUpdateExistingNode(nodeType: string, newContent: string, currentNode: Node) {
	if (!currentNode.type) { // head node
		currentNode.type = nodeType;
		currentNode.content = newContent;
	}else if (currentNode.type !== nodeType || nodeType.startsWith("link marker")) {
		currentNode.next = {type: nodeType, closed: true, content: newContent, next: null, prev: currentNode};
		currentNode =	currentNode.next; 
	}else {
		currentNode.content += newContent;
	}
	if (nodeType.startsWith("link marker")) {
		currentNode.closed = false;
	}
	return currentNode;
}

function processPossibleCodeSpan(startIndex: number, textStream: string): [string, number] {
	let startDelimiter = "";
	let potEndDelimiter = ""; // potential end delimiter
	let contentStartIndex = -1;
	let contentEndIndex = -1;
	let codeSpanEndIndex = -1;

	for (let i=startIndex; i<textStream.length; i++) {
		if (textStream[i] !== '`' && !startDelimiter) {
			startDelimiter = textStream.slice(startIndex, i);
			contentStartIndex = i;
		}else if (textStream[i] === '`' && startDelimiter) {
			potEndDelimiter += textStream[i];
		}
		if (potEndDelimiter && (i==textStream.length-1 || textStream[i+1] !== '`')) {
			if (potEndDelimiter === startDelimiter) {
				codeSpanEndIndex = i;
				contentEndIndex = i-potEndDelimiter.length;
				break;
			}else potEndDelimiter = "";
		}

		if (i === textStream.length - 1) {
			if (!startDelimiter) {
				return ["", startIndex];
			}
			return ["", startIndex+startDelimiter.length-1]; // - 1 cause startDelimiter's first index is equivalent to startIndex
		}
	}
	let codeContent = textStream.slice(contentStartIndex, contentEndIndex+1);
	codeContent = codeContent.replaceAll(/\n|(?:\r\n)/g, ' ');
	if ((/\S/).test(codeContent) && codeContent[0] === ' ' && codeContent[codeContent.length-1] === ' ') {
		codeContent = codeContent.slice(1, codeContent.length-1);
	}
	return [`<code>${codeContent}</code>`, codeSpanEndIndex];
}

// transform node content into raw em|strong tag html
function transformNodes(opener: Node, closer: Node): Node{
	let newNodeName = ""
	if (closer.content.length >= 2 && opener.content.length >= 2) {
		if (closer.content.length % 2 === 0) {
			newNodeName = "strong";
		}else {
			newNodeName = "em"
		}
	}else if (opener.content.length === 1 || closer.content.length === 1) {
		newNodeName = "em";
	}

	if (opener.content.length <= 2) {
		opener.content = opener.content.length === 1 ? "<em>" : "<strong>"
		opener.type = "raw html";
	}else {
		let newNode:Node = {type: "raw html", closed: true, content: `<${newNodeName}>`, next: opener.next, prev: opener};
		opener.next = newNode;
	}

	if (closer.content.length <= 2) {
		closer.content = closer.content.length === 1 ? "</em>" : "</strong>"
		opener.type = "raw html";
	}else {
		let newNode = {type: "raw html", closed: true, content: `</${newNodeName}>`, next: closer, prev: closer.prev};
		closer.prev = newNode;
	}

	if (opener.type === "raw html" || closer.type === "raw html") {
		return;
	}

	if (newNodeName === "em") {
		opener.content = opener.content.slice(0, opener.content.length-1)
		closer.content = closer.content.slice(1);
		transformNodes(opener, closer);
	}else {
		opener.content = opener.content.slice(0, opener.content.length-2)
		closer.content = closer.content.slice(2);
		transformNodes(opener, closer);
	}
}

function uselessAllMarkersBetween(startNode: Node, targetNode: Node) {
	let currentNode = startNode.next;
	while (true) {
		if (!currentNode || currentNode === targetNode) {
			break;
		}else if (currentNode.type === startNode.type) {
			currentNode.type = "text content";
		}
		currentNode = currentNode.next;
	}
}

function findClosingNode(openingNode: Node) {
	let currentNode = openingNode.next;
	while (true) {
		if (!currentNode) break;
		if ((currentNode.content[0] === openingNode.content[0]) && 
			currentNode.type.startsWith("right flanking")) {
			uselessAllMarkersBetween(openingNode, currentNode as Node);
			return currentNode;
		}
		currentNode = currentNode.next;
	}
	return null
}


function processEmphasisNodes(head: Node) { // TODO: process nodes that are both right and left flanking as well as '_' marker special cases
	let currentNode = head;
	let openers = [];
	while (true) {
		if (currentNode.type.startsWith("left flanking")) {
			openers.push(currentNode);
		}
		currentNode = currentNode.next as Node;
		if (!currentNode) break;
	}
	for (let i=openers.length-1; i>=0; i--) {
		let closingNode = findClosingNode(openers[i]);
		if (closingNode) {
			transformNodes(openers[i], closingNode)
		}
	}
}


function getEscapedForm(char: string): string {
	switch(char) {
		case "<":
			return "&lt;"
		case '>':
			return "&gt;"
		case "'":
			return "&apos;";
		case '"':
			return "&quot;"
		case '(':
			return "&lpar;";
		case ')':
			return "&rpar;";
		default:
			return char
	}
}

// note to self: incase you are trying to be smart and a devilish regex thought is
// springing up as a result of reviewing this code in the nearest future, U CAN'T USE REGEX!.
// Regex isn't used because It can't match nested possible balanced brackets in link destinations.
// It could also be a skill issue.. regardless, It's either impossible or I don't know how

function getCharTokenType(linkDest: string, linkTitle: string, char: string, currTokenType: string) {
	if (linkDest && linkTitle && currTokenType === "whitespace" && char !== ')') {
		return null;
	}else if (!linkDest && char == '<') {
		return "opened uri";
	}else if (!linkDest) {
		return "uri";
	}else if (currTokenType === "opened uri" && char === '>') {
		return "closed uri";
	}else if (!linkTitle && currTokenType === "whitespace") {
		if (("\"'(").includes(char)) {
			return "title"
		}else return null;
	}else if (currTokenType === "title" && char === linkTitle[0]) {
		return "whitespace";
	}else if (currTokenType === "closed uri") { // uris of form '<content>' should be followed immediately by whitespace
		return null;
	}
	return currTokenType;
}

// get link attributes and remove nodes containing the link attributes
function getLinkAttributes(node: Node) {
	let linkAttributes = {uri: "", title: ""};
	let currentTokenType = ""
	let textStream = node.content;
	if (textStream[0] !== '(') {
		return null;
	}
	let unBalancedParenthesis = 0;
	let nodesWithLinkAttributes = [node]
	let i = 0;

	while (true) {
		let char = textStream[i];
		// detect whitespaces and the first '(' char after the link text marker which is also a marker.
		let charIsWhiteSpace = (/\s/).test(char) || (nodesWithLinkAttributes.length === 1 && i === 0);
		if (charIsWhiteSpace) {
			if (currentTokenType === "closed uri" || (currentTokenType === "uri" && unBalancedParenthesis === 0))  {
				currentTokenType = "whitespace"
			}else if (currentTokenType === "uri") {
				return null
			}
		}else {
			currentTokenType = getCharTokenType(linkAttributes.uri, linkAttributes.title, char, currentTokenType) as string;
			if (!currentTokenType) {
				return null
			}
		}

		if (char === '(' && currentTokenType === "uri") {
			unBalancedParenthesis++;
		}else if (char === ')' && currentTokenType === "uri" && unBalancedParenthesis > 0) {
			unBalancedParenthesis--;
		}else if (char === ')' && (currentTokenType === "whitespace" || currentTokenType === "uri")) {
			break;
		}

		if (currentTokenType === "opened uri" || (currentTokenType === "uri" && !charIsWhiteSpace)) {
			linkAttributes.uri += char;
		}else if (currentTokenType === "title" && (!linkAttributes.title || linkAttributes.title[0] !== char)) {
			linkAttributes.title += char;
		}

		if (i !== textStream.length - 1) {
			i++;
			continue;
		}

		const newNode = nodesWithLinkAttributes[nodesWithLinkAttributes.length-1].next;
		if (newNode && newNode.type !== "raw html") {
			nodesWithLinkAttributes.push(newNode);
			textStream = newNode.content;
			i = 0;
		}else if (newNode && newNode.type === "raw html" && !linkAttributes.uri) { // we might have parsed
			linkAttributes.uri = newNode.content;
			i = newNode.content.length-1;
			currentTokenType = "whitespace"
		}else {
			return null;
		}
	}

	let listLength = nodesWithLinkAttributes.length;
	if (nodesWithLinkAttributes[listLength-1].content.length !== i+1) {
		nodesWithLinkAttributes[listLength-1].content = nodesWithLinkAttributes[listLength-1].content.slice(i+1);
		nodesWithLinkAttributes.pop();
	}

	if (nodesWithLinkAttributes.length > 0) {
		(nodesWithLinkAttributes[0].prev as Node).next = nodesWithLinkAttributes[listLength-1].next as Node;
	}
	linkAttributes.title = linkAttributes.title ? linkAttributes.title.slice(1) : "";
	return linkAttributes;
}

function closeAllLinkMarkersInBetween(startNode: Node, endNode: Node) {
	let currentNode = startNode.next
	while (currentNode !== endNode) {
		(currentNode as Node).closed = true
		currentNode = (currentNode as Node).next;
	}
}

function normalized(str: string) {
	return str.toLowerCase().replace(/\s+/, ' ').trim();
}

function getReferenceLinkData(labelStr: string, linkRefs: LinkRef[]) {
	for (let obj of linkRefs) {
		if (normalized(obj.label) === normalized(labelStr)) {
			return {uri: obj.destination, title: obj.title};
		}
	}
	return null;
}

function getLinkAttributesFromLabel(labelStartNode: Node, linkRefs: LinkRef[]) {
	if (!labelStartNode.next) {
		return null
	}
	if (labelStartNode.next.type === "link marker end"){ // link structure is in form [link text][]
		labelStartNode.prev.next = labelStartNode.next.next; // 'deletes' the nodes containing the []
		return null;
	}else if (labelStartNode.next.type !== "text content") return null;

	const labelEndNode = labelStartNode.next.next
	if (labelEndNode && labelEndNode.type === "link marker end") {
		let refLinkData = getReferenceLinkData(labelStartNode.next.content, linkRefs);
		if (refLinkData) {
			labelStartNode.prev.next = labelEndNode.next; // 'deletes' the nodes containing the link label from the linked list
			return refLinkData
		}
	}
	return null
}

function getEnclosedText(opener: Node, closer: Node) {
	let currentNode = opener.next;
	let outputText = "";

	while (currentNode !== closer) {
		outputText += currentNode.content;
		currentNode = currentNode.next;
	}
	return outputText;
}

function getRefLinks(openerNode: Node, linkRefs: LinkRef[]) {
	let currentNode = openerNode;
	let unBalancedBracketsNum = 0;
	while (true){
		if (currentNode.type === "link marker end") {
			if (unBalancedBracketsNum === 0) {
				return null;
			}
			unBalancedBracketsNum--;
			if (unBalancedBracketsNum === 0 && (!currentNode.next || currentNode.next.type === "link marker start")){
				break;
			}
		}else if (currentNode.type === "link marker start") {
			unBalancedBracketsNum++;
		}
		if (!currentNode.next) {
			break;
		}
		currentNode = currentNode.next;
	}
	let linkTextBoundary = currentNode;
	let linkAttributes;
	if (currentNode.next) {
		linkAttributes = getLinkAttributesFromLabel(currentNode.next,  linkRefs)
	}
	if (!linkAttributes) {
		// check if it's a shortcut or collapsed link reference
		linkAttributes = getReferenceLinkData(getEnclosedText(openerNode, currentNode), linkRefs);
	}
	return linkAttributes ? [linkTextBoundary, linkAttributes] : null
}

function generateLinkNodes(head: Node, linkRefs: LinkRef[]) {
	let currentNode = head;
	let openedLinkTextMarkers: Node[] = [];

	while (true) {
		if (currentNode.type === "link marker end" && openedLinkTextMarkers.length === 0) {
			currentNode.type = "text content";
			currentNode.closed = true;
		}else if (currentNode.type === "link marker start" && !currentNode.closed) {
			openedLinkTextMarkers.push(currentNode)
		}else if (currentNode.type === "link marker end") {
			let linkMarkerStart:Node;
			let linkAttributes = currentNode.next && getLinkAttributes(currentNode.next as Node);
			if (linkAttributes) {
				linkMarkerStart = (openedLinkTextMarkers.pop() as Node)
			}else {
				let data = getRefLinks(openedLinkTextMarkers[0], linkRefs);
				if (data) {
					linkMarkerStart = openedLinkTextMarkers[0];
					currentNode = data[0] as Node;
					linkAttributes = data[1] as {uri: string, title: string};
				}
			}
			if (linkAttributes) {
				linkMarkerStart.closed = true;
				closeAllLinkMarkersInBetween(linkMarkerStart, currentNode)
				linkMarkerStart.content = `<a href="${linkAttributes.uri}" title="${linkAttributes.title}">`
				currentNode.content = "</a>";
			}
			openedLinkTextMarkers.forEach(marker => {marker.closed = true});
			openedLinkTextMarkers = [];
			currentNode.closed = true;
		}
		if (!currentNode.next) {
			break;
		}
		currentNode = currentNode.next;
	}
	return head;
}

function setAsLeftOrRightFlanking(delimiterNode: Node, nextChar: string) {
	let nextCharIsPunc = PUNCTUATIONS.includes(nextChar);
	// since new lines should be treated as whitespace
	let prevChar = delimiterNode.prev ? delimiterNode.prev.content[delimiterNode.prev.content.length-1] : ' ';
	let prevCharIsPunc = PUNCTUATIONS.includes(prevChar);

	if (!(/\s/).test(nextChar) && !nextCharIsPunc) {
		delimiterNode.type = "left flanking " + delimiterNode.type;
	}else if (nextCharIsPunc && (prevCharIsPunc || (/\s/).test(prevChar))) {
		delimiterNode.type = "left flanking " + delimiterNode.type;
	}else if (!(/\s/).test(prevChar) && !prevCharIsPunc) {
		delimiterNode.type = "right flanking " + delimiterNode.type;
	}else if (prevCharIsPunc && (nextCharIsPunc || (/\s/).test(nextChar))) {
		delimiterNode.type = "right flanking " + delimiterNode.type;
	}
}


// generates a doubly linked list
function generateLinkedList(text: string) {
	const head:Node = {type: "", closed: false, content: "", next: null, prev: null}
	let currNode = head;
	let charIsEscaped = false;
	let i=0;

	while (i < text.length){
		if (charIsEscaped && PUNCTUATIONS.includes(text[i])) {
			let replacement = getEscapedForm(text[i]);
			currNode = addOrUpdateExistingNode("text content", replacement, currNode);
			charIsEscaped = false;
		}else if (text[i] === '\\'){
			charIsEscaped = true;
		}else if (text[i] === '<') { // TODO: ESCAPE Ampersands;
			let htmlTagEndPos = getHtmlTagEndPos(i, text);
			if (htmlTagEndPos > -1) {
				currNode = addOrUpdateExistingNode("raw html", text.slice(i, htmlTagEndPos + 1), currNode)
				i = htmlTagEndPos + 1;
				continue;
			}
			let autoLinkStr = getAutoLinkStr(i, text);
			if (autoLinkStr) {
				let rawHtml = `<a href="${autoLinkStr}">${autoLinkStr}</a>`;
				currNode = addOrUpdateExistingNode("raw html", rawHtml, currNode)
				i += autoLinkStr.length-1; // 1 is subtracted since it's zero based
				continue;
			}
			let matchedPattern = text.slice(i).match(/<!--(?!(?:>|->))[^]*-->/)
			if (matchedPattern) {
				currNode = addOrUpdateExistingNode("raw html", matchedPattern[0], currNode);
				i += matchedPattern[0].length;
				continue;
			}
			currNode = addOrUpdateExistingNode("text content", "&lt;", currNode);
		}else if (text[i] === '`') {
			const [codeSpan, syntaxEnd] = processPossibleCodeSpan(i, text);
			if (codeSpan) {
				currNode = addOrUpdateExistingNode("raw html", codeSpan, currNode);
			}else currNode = addOrUpdateExistingNode("text content", text.slice(i, syntaxEnd+1), currNode);
			i = syntaxEnd;
		}else if (text[i] === '>') {
			currNode = addOrUpdateExistingNode("text content", "&gt;", currNode);
		}else if (text[i] === '[') {
			currNode = addOrUpdateExistingNode("link marker start", text[i], currNode);
		}else if (text[i] === ']') {
			currNode = addOrUpdateExistingNode("link marker end", text[i], currNode);
		}else if (text[i] === '*') {
			currNode = addOrUpdateExistingNode("star delimiter", text[i], currNode);
			if (i<text.length-1 && text[i+1] !== '*'){
				setAsLeftOrRightFlanking(currNode, text[i+1]);
			}else if (i === text.length-1) setAsLeftOrRightFlanking(currNode, ' ');
		}else if (text[i] === '_') {
			currNode = addOrUpdateExistingNode("underscore delimiter", text[i], currNode);
			if (i<text.length-1 && text[i+1] !== '_'){
				setAsLeftOrRightFlanking(currNode, text[i+1]);
			}else if (i === text.length-1) setAsLeftOrRightFlanking(currNode, ' ');
		}else {
			currNode = addOrUpdateExistingNode("text content", text[i], currNode);
			charIsEscaped = false // incase
		}
		i++;
	}
	return head;
}


function convertLinkedListToText(head: Node) {
	let currentNode = head;
	let outputText = ""
	while (true) {
		outputText += currentNode.content;
		if (!currentNode.next) {
			break;
		}
		currentNode = currentNode.next;
	}
	return outputText;
}

function parseInlineNodes(text: string, linkRefs: LinkRef[]): string {
	let listHead = generateLinkedList(text);
	generateLinkNodes(listHead, linkRefs);
	processEmphasisNodes(listHead);
	return convertLinkedListToText(listHead);
}
