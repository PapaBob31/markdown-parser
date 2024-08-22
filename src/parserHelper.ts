import type {HtmlNode} from "./index"
import {lineIsHorizontalRule} from "./utilities"

interface LinkRef {
	label: string;
	destination: string;
	title: string
}

const PUNCTUATIONS = "<>;,.()[]{}!`~+-*&^%$#@\\/\"':?~|";

export function generateHtml(rootNode: HtmlNode, indentLevel: number, linkRefs: LinkRef[]):string {
	let text = "";
	const whiteSpace = ' '.repeat(indentLevel);
	if (rootNode.nodeName === "paragraph" || (/h[1-6]/).test(rootNode.nodeName)) {
		rootNode.textContent = parseInlineNodes(rootNode.textContent as string, linkRefs);
	}
	if (rootNode.nodeName === "html block") {
		text = `${whiteSpace}${rootNode.textContent}\n`
	}else if (rootNode.nodeName === "paragraph") {
		text = `${whiteSpace}<p>${rootNode.textContent}</p>\n`
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
			!childNode.textContent && console.log(childNode);
			let linkReference = getLinkReferenceDefs(childNode.textContent as string);
			if (linkReference) {
				refs.push(linkReference);
				rootNode.children.splice(i, 1)
			}
		}
	}
	return refs;
}

function getLinkReferenceDefs(text: string) { // TODO: search and replace all escaped characters with regex
	const linkData = text.match(/^\s{0,3}\[([^])\]:\s*((?:<.*>)|(?:\S+))(\s*(?:"|'|\()[^]+)?\s*$/);
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
		if (linkData[3].includes("\n\n") || linkData[3][0] !== linkData[3][linkData[3].length-1]) {
			// first condition is maybe a crude way of checking if the text contais blank lines
			return null
		}else linkRefDef.title = linkData[3].slice(0, linkData[3].length-1);
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

function getAutoLinkEndPos(startIndex: number, text: string) {
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

function getLinks(startIndex: number, text: string) {
	let unBalanacedBracketsPos = [];
	for (let i=startIndex; i<text.length; i++) {
		if (text[i] === '[') {
			unBalanacedBracketsPos.push(i);
		}else if (text[i] === ']' && unBalanacedBracketsPos.length > 0 && text[i+1] === '(') {

		}
	}
}

function contentIsLeftFlanking(delimiterNode: Node) {
	if (!(["star delimiter", "underscore delimiter"]).includes(delimiterNode.type)) {
		return false;
	}

	if (!delimiterNode.next) {
		return false;
	}
	if (delimiterNode.next.content[0] !== ' ' && !PUNCTUATIONS.includes(delimiterNode.next.content[0])) {
		return true
	}
	if (!delimiterNode.prev) {
		return false;
	}
	if (PUNCTUATIONS.includes(delimiterNode.next.content[0]) && (PUNCTUATIONS.includes(delimiterNode.prev.content[0]) || delimiterNode.prev.content[0] === ' ')) {
		return true
	}
	return false // execution should never reach here tho but typescript mehn
}

function contentIsRightFlanking(delimiterNode: Node) {
	if (!(["star delimiter", "underscore delimiter"]).includes(delimiterNode.type)) {
		return false;
	}

	if (!delimiterNode.prev) {
		return false;
	}
	if (delimiterNode.prev.content[0] !== ' ' && !PUNCTUATIONS.includes(delimiterNode.prev.content[0])) {
		return true
	}
	if (!delimiterNode.next) {
		return false;
	}
	if (PUNCTUATIONS.includes(delimiterNode.prev.content[0]) && (PUNCTUATIONS.includes(delimiterNode.next.content[0]) || delimiterNode.next.content[0] === ' ')) {
		return true
	}
	return false // execution should never reach here tho but typescript mehn
}

// transform node content into raw em|strong tag html
function transformNodes(opener: Node, closer: Node): Node{
	// look into the code below. the swapping and generation of nodes looks fraudulent
	if (closer.content.length > 2 && opener.content.length > 2) {
		opener.next = {type: "raw html", closed: true, content: "<strong>", next: opener.next, prev: opener};
		opener.content = opener.content.slice(0, opener.content.length-2);

		closer.prev = {type: "raw html", closed: true, content: "</strong>", next: closer, prev: closer.prev,};
		closer.content = closer.content.slice(0, 3);
		return transformNodes(opener, closer);
	}else if (closer.content.length === 2 && opener.content.length === 2) {
		opener.content = "<strong>"
		opener.type = "raw html"

		closer.content = "</strong>"
		closer.type = "raw html"
	}else if (closer.content.length === 1 && opener.content.length == 1) {
		closer.content = "</em>"
		closer.type = "raw html"

		opener.content = "<em>"
		opener.type = "raw html"
	}else if (closer.content.length == 1 && opener.content.length > 1){
		opener.next = {type: "raw html", closed: true, content: "<em>", next: opener.next, prev: opener};
		opener.content = opener.content.slice(0, opener.content.length-1);

		closer.content = "</em>"
		closer.type = "raw html"
	}else if (closer.content.length > 1 && opener.content.length == 1) {
		opener.content = "<em>"
		opener.type = "raw html"

		closer.prev = {type: "raw html", closed: true, content: "</em>", next: closer, prev: closer.prev,};
		closer.content = closer.content.slice(0, 1);
	}
	return closer;
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

function getMatchingNode(ogNode: Node){
	let matchingNode = null;
	let currentNode = ogNode.prev;

	while (true) {
		if (!currentNode) {
			break;
		}else if (!contentIsLeftFlanking(currentNode)) {
			currentNode = currentNode.prev;
			continue;
		}else if (currentNode.type === ogNode.type && currentNode.content.length === ogNode.content.length) {
			matchingNode = currentNode;
			break;
		}else if (currentNode.type === ogNode.type && !matchingNode){
			if (!matchingNode) {
				matchingNode = currentNode; // store the nearsest type incase we never find one with matching length;
			}
		}
		currentNode = currentNode.prev;
	}
	matchingNode && uselessAllMarkersBetween(matchingNode, currentNode as Node);
	return matchingNode;
}


function processEmphasisNodes(head: Node) {
	let currentNode = head;
	while (true) {
		if (contentIsRightFlanking(currentNode)) {
			let openerNode = getMatchingNode(currentNode);
			if (!openerNode) {
				currentNode.type = "text content";
				continue;
			}
			currentNode = transformNodes(openerNode, currentNode);
		}
		currentNode = currentNode.next as Node;
		if (!currentNode) break;
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

function generateLinkNodes(head: Node) {
	let currentNode = head;
	let openedLinkTextMarkers: Node[] = [];

	while (true) {
		if (currentNode.type === "link marker end" && openedLinkTextMarkers.length === 0) {
			currentNode.type = "text content";
		}else if (currentNode.type === "link marker start" && !currentNode.closed) {
			openedLinkTextMarkers.push(currentNode)
		}else if (currentNode.type === "link marker end") {
			const linkMarkerStart = (openedLinkTextMarkers.pop() as Node)
			linkMarkerStart.closed = true;
			let linkAttributes = getLinkAttributes(currentNode.next as Node)
			if (linkAttributes) {
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
			console.log("1")
			let htmlTagEndPos = getHtmlTagEndPos(i, text);
			console.log("2")
			if (htmlTagEndPos > -1) {
				currNode = addOrUpdateExistingNode("raw html", text.slice(i, htmlTagEndPos + 1), currNode)
				i = htmlTagEndPos + 1;
				continue;
			}
			console.log("3")
			let autoLinkStr = getAutoLinkEndPos(i, text);
			console.log("4")
			if (autoLinkStr) {
				let rawHtml = `<a href="${autoLinkStr}">${autoLinkStr}</a>`;
				currNode = addOrUpdateExistingNode("raw html", rawHtml, currNode)
				i += autoLinkStr.length-1; // 1 is subtracted since it's zero based
				continue;
			}
			/*let matchedPattern = text.slice(i).match(/<!--(?:[^](?!<!--))*?-->/) // prolly bad regex for matching html comments. improve later
			if (matchedPattern) {
				i = matchedPattern[0].length-1;
				continue;
			}*/
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
		}else if (text[i] === '_') {
			currNode = addOrUpdateExistingNode("underscore delimiter", text[i], currNode);
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
	generateLinkNodes(listHead);
	processEmphasisNodes(listHead);
	return convertLinkedListToText(listHead);
}
