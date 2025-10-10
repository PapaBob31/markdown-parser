import type { HtmlNode } from "../index"
import parseInlineNodes, { PUNCTUATIONS, escapeSpecialCharacters, getEscapedForm, parseCharRef } from "./inlineNodesParser"
import { extractLinkRefsData } from "./inlineNodesParser/linkGenerator"
import type {LinkRefData, LinkRefDataMap} from "./inlineNodesParser/linkGenerator"

/** Recursively traverses a markdown content tree and extract link reference definition values if any, from paragraph nodes content
 * @param {HtmlNode} rootNode - The root node of the tree 
 * @param {Object} linkRefsMap -  Dictionary mapping link labels to link attributes from commonmark link reference definitions */
export function updateLinkRefsMap(rootNode: HtmlNode, linkRefsMap: LinkRefDataMap) {
	const containerNodes = ["root", "li", "blockquote", "ol", "ul"];
	if (containerNodes.includes(rootNode.nodeName)){
		const lastChildNode = rootNode.children[rootNode.children.length-1];
		for (let child of rootNode.children) {
			if (child.nodeName === "paragraph") {
				const newText = extractLinkRefsData(child.textContent, linkRefsMap)
				if (newText){
					child.textContent = newText
				}else {
					child.nodeName = "deleted"
				}
			}else if (containerNodes.includes(child.nodeName)){
				updateLinkRefsMap(child, linkRefsMap)
			}
		}
		rootNode.children = rootNode.children.filter(child => child.nodeName != "deleted")
	}
}



/** Apply extra processing on the content of a leaf node such as parsing inline nodes and escaping special characters
 * @param {HtmlNode} node - Node whose content is to be processed
 * @param {Object} linkRefsMap -  Dictionary mapping link labels to link attributes from commonmark link reference definitions 
 * @param {string[]} dangerousHtml - List of html tag names whose tags we don't want as part of output when parsing the markdown text */
function parseContent(node: HtmlNode, linkRefs: LinkRefDataMap, dangerousHtmlTags:string[]) {
	if (node.nodeName === "paragraph" || (/h[1-6]/).test(node.nodeName)) {
		node.textContent = parseInlineNodes(node.textContent as string, linkRefs, dangerousHtmlTags);
	}else if (["indented code block", "fenced code backtick", "fenced code tilde"].includes(node.nodeName)) {
		node.textContent = escapeSpecialCharacters(node.textContent)
	}
}

/** Determines if a node's ancestor list node is loose or not 
 * @param {HtmlNode} node - The node whose ancestor is to be checked
 * @returns {boolean} - true if the list node is loose, false if not */
function listAncestorIsLoose(node: HtmlNode){
	let listNodeAncestor = node.parentNode.parentNode;
	if (listNodeAncestor && !listNodeAncestor.tight) {
		return true;
	}
	return false;
}


/** Gets  the non whitespace text before the first whitespace or unescaped punctuation. The first punctuation could also 
 * be returned if it's the first non whitespace character and unescaped. This function doesn't expect the text to start with whitespace
 * @param {HtmlNode} node - The node whose ancestor is to be checked
 * @returns {string} - the first word string */
function getFirstWord(text: string) {
	const punctuations = "\"!#$%&'()*+,-./:;<=>?@,[\\]^_`,{|}~"
	let firstWord = ""

	for (let i=0; i<text.length; i++) {
		const char = text[i]
		if ((/\s/).test(char)){
			return firstWord
		}
		if (punctuations.includes(char))  {
			if (char === "\\" && i !== text.length-1 && punctuations.includes(text[i+1])) // escape character 
				continue
			if (i===0 || text[i-1] !== '\\') {
				if (!firstWord)
					return char
				return firstWord
			}
		}
		firstWord += char
	}

	return firstWord
}

/** Generates the html text representation of a markdown leaf block node.
 * @param {HtmlNode} node - The node whose html text representation is generated
 * @returns {string} - the generated html text representation */
function generateNodeHtml(node: HtmlNode) {
	if (node.nodeName === "html block") {
		return `${node.textContent.trimEnd()}\n`
	}else if (node.nodeName === "paragraph") {
		if (node.infoString === "loose") {
			return node.textContent ? `<p>${node.textContent.trim()}</p>\n` : "";
		}else {
			return node.textContent.trim();
		}
	}else if ((/h[1-6]/).test(node.nodeName)) {
		const tag = node.nodeName;
		return `<${tag}>${node.textContent}</${tag}>\n` // html header
	}else if (node.nodeName.startsWith("fenced code") || node.nodeName === "indented code block") {
		if (node.nodeName === "indented code block") {
			let contentEndIndex = -1
			for (let i=node.textContent.length-1; i>=0; i--) {
				if (node.textContent[i] === '\n')
					contentEndIndex = i // first new line character after the indented code block's content ends
				else if (!(/\s/).test(node.textContent[i])) {
					break;
				}
			}

			if (contentEndIndex > -1){
				node.textContent = node.textContent.slice(0, contentEndIndex)
			}
		}
		if (node.textContent && node.textContent[node.textContent.length-1] !== '\n')
			node.textContent+='\n' // content must always end with a newline
		
		return `<pre><code${node.infoString ? (" class=\"language-"+getFirstWord(parseCharRef(node.infoString))+'"') : ''}>${node.textContent}</code></pre>\n`
	}
}


/** Removes the leading zeros from a text representing a number
 * @param {string} numText - The text representing the number */
function removeLeadingZeros(numText: string){
	let firstNonZeroCharIndex = -1
	for (let i=0; i<numText.length; i++){
		if (i === numText.length-1 || numText[i] !== '0'){
			firstNonZeroCharIndex = i
			break;
		}
	}
	return numText.slice(firstNonZeroCharIndex)		
}


/** Generates html text from a markdown content tree. The text generated is the html output of a markdown text
 * @param {HtmlNode} rootNode - The root node of the tree 
 * @param {Object} linkRefsMap -  Dictionary mapping link labels to link attributes from commonmark link reference definitions
 * @param {string[]} dangerousHtmlTags - array of strings containing tag names that would be considered dangerous html 
 * @returns {string} - The Html text generated*/
export default function generateHtmlFromTree(rootNode: HtmlNode, linkRefs: LinkRefDataMap, dangerousHtmlTags:string[]):string {
	let text = "";

	// Generate the opening tag for the node
	if (rootNode.nodeName === "hr") {
		return `<${rootNode.nodeName} />\n`
	}else if (rootNode.nodeName === "ol") {
		text = `<${rootNode.nodeName}${rootNode.startNo != '1' ? ' start="'+removeLeadingZeros(rootNode.startNo)+'"' : ""}>\n`	
	}else if (rootNode.textContent === undefined) {
		text = `<${rootNode.nodeName}>\n`;
	}

	if (rootNode.textContent === undefined && rootNode.children.length === 0 && rootNode.nodeName !== "blockquote")
		text = text.slice(0, text.length-1)

	if (rootNode.textContent === undefined) { // rootNode is a container block
		if (rootNode.nodeName === "root") // the root node of the tree
			text = ""; // Html shouldn't be generated for the tree's root node because it represents the document being parsed

		for (let i=0; i<rootNode.children.length; i++) {
			const childNode = rootNode.children[i];

			if (childNode.nodeName === "paragraph") {
				if (childNode.parentNode.nodeName !== "li" || listAncestorIsLoose(childNode)) {
					childNode.infoString = "loose"
				}else if (i === 0) { // first child node of a tight list
					text = text.slice(0, text.length-1) // remove new line that must have been appended to the parent list item opening tag
				}
			}else if (childNode.nodeName === "blank") {
				continue;
			}
			text += generateHtmlFromTree(childNode, linkRefs, dangerousHtmlTags);
			if (rootNode.children.length > 1 && (childNode.nodeName === "paragraph") && childNode.infoString != "loose") {
				if (i !== rootNode.children.length-1)
					text += '\n'
			}
		}

	}else { // rootNode is a leaf block
		parseContent(rootNode, linkRefs, dangerousHtmlTags)
		text = generateNodeHtml(rootNode);
	}

	if (rootNode.textContent === undefined && rootNode.nodeName !== "root") {
		text += `</${rootNode.nodeName}>\n`; // Generate the closing tag for the node
	}
	
	return text;
}

