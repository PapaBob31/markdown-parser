import type { HtmlNode } from "../../index"
import parseInlineNodes, { PUNCTUATIONS, escapeSpecialCharacters, getEscapedForm, parseCharRef } from "../inlineNodesParser"
import { extractLinkRefsData } from "../inlineNodesParser/linkGenerator"
import type {LinkRefData, LinkRefDataMap} from "../inlineNodesParser/linkGenerator"

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



/** Modifies the content of a leaf node by parsing inline nodes and escaping special characters
 * @param {HtmlNode} node - Node whose content is to be processed
 * @param {Object} linkRefsMap -  Dictionary mapping link labels to link attributes from commonmark link reference definitions 
 * @param {string[]} dangerousHtml - List of html tag names whose tags we don't want as part of output when parsing the markdown text */
function parseContent(node: HtmlNode, linkRefs: LinkRefDataMap, dangerousHtmlTags:string[]) {
	if (node.nodeName === "paragraph" || (/h[1-6]/).test(node.nodeName)) {
		/* leading or trailing spaces are mainly stripped off before inline parsing so that spaces or tabs produced from entity references at the 
		 beginning or end of text won't also get stripped off and a paragraph that ends with two or more spaces won't end with a hard line break */
		node.textContent = node.textContent.trim() // 
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
	if (node.nodeName === "hr") {
		return `<hr />\n`
	}else if (node.nodeName === "html block") {
		return `${node.textContent.trimEnd()}\n`
	}else if (node.nodeName === "paragraph") {
		if (node.parentNode.nodeName === "li" && !listAncestorIsLoose(node)) {
			return node.textContent;
		}else {
			return node.textContent ? `<p>${node.textContent}</p>\n` : "";
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
	const containerNodes = ["blockquote", "li", "ul", "ol"]

	// Generate the opening tag for a container node
	if (rootNode.nodeName === "ol") {
		text = `<${rootNode.nodeName}${rootNode.startNo != '1' ? ' start="'+removeLeadingZeros(rootNode.startNo)+'"' : ""}>`	
	}else if (rootNode.nodeName !== "root") {
		text = `<${rootNode.nodeName}>`;
	}

	if (rootNode.nodeName !== "li" && rootNode.nodeName !== "root"){
		/* prevents child nodes html from starting on the same line as rootNode's opening tag since this node can't possibly 
		 be a tight list node and it can't be the root node whose content can never start with a new line*/
		text += "\n" 
	}

	for (let i=0; i<rootNode.children.length; i++) {
		const childNode = rootNode.children[i];
		if (rootNode.nodeName === "li") {
			if ((childNode.nodeName !== "paragraph" || listAncestorIsLoose(childNode)) && text[text.length-1] !== '\n') {
				text += "\n" // Ancestor list node is not a tight list so it's first child node html will start on a new line
			}
		}
		if (containerNodes.includes(childNode.nodeName)){
			text += generateHtmlFromTree(childNode, linkRefs, dangerousHtmlTags);
		}else if (childNode.nodeName !== "blank"){
			parseContent(childNode, linkRefs, dangerousHtmlTags)
			text += generateNodeHtml(childNode);
		}
	}

	if (rootNode.nodeName !== "root") {
		text += `</${rootNode.nodeName}>\n`; // Generate the closing tag for a container node
	}
	
	return text;
}

