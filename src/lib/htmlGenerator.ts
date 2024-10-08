import type { HtmlNode } from "../index"
import parseInlineNodes, { PUNCTUATIONS, getEscapedForm } from "./inlineNodesParser"

export interface LinkRef {
	label: string;
	destination: string;
	title: string
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

function formattedString() {

}

function escapeSpecialCharacters(text: string) {
	let i=0;
	let escapedText = ""

	while (i < text.length){
		if (PUNCTUATIONS.includes(text[i])) {
			escapedText += getEscapedForm(text[i]);
		}else {
			escapedText += text[i];
		}
		i++;
	}

	return escapedText
}


/*
	'|' must delimit cells
	my implementation, my rules
	|| i.e pipes without any content in between isn't allowed, put something even if it's just whitespace
	beginning and ending whitespace would be stripped if present

*/
function getRowContents(line: string){
	let cellData = "";
	let cells = [];
	let i = 0;

	while (i < line.length) {
		if (line[i] === '|') {
			if (cellData) {
				cells.push(cellData);
				cellData = "";
			}else if (cells.length > 0) {
				cells = [];
				break;
			}	
		}else {
			cellData += line[i]
		}
		i++;

		if (i == line.length-1 && line[i] !== '|') {
			cells = [];
		}
	}
	return cells
}

function getCellAlignment(cell: string) {
	let alignment = null
	if (cell[0] === ":")
		alignment = "left";

	if (cell[cell.length-1] === ":" && alignment === "left")
		alignment = "center"
	else if (cell[cell.length-1] === ":" && alignment !== "left")
		alignment = "right";

	return alignment
}

interface TableData {
	headerCells: string[];
	bodyCells: string[][];
	cellsAlignment: string[];
}

function stripSpace(text: string) {
	if (text[0] === text[text.length-1] && text[0] === ' ') {
		return text.slice(1, text.length-1)
	}
	return text
}

function generateTableHtml(tableData: TableData){
	let text = "<table>\n<thead>\n<tr>\n"

	for (let i=0; i < tableData.headerCells.length; i++) {
		const alignment = tableData.cellsAlignment[i]
		const cell = tableData.headerCells[i]
		text += `<th${alignment ? ' align='+alignment: ""}>${stripSpace(cell)}</th>\n`
	}
	text += "</tr>\n</thead>\n<tbody>\n"

	for (let row of tableData.bodyCells) {
		text += "<tr>\n"
		for (let i=0; i<row.length; i++) {
			const alignment = tableData.cellsAlignment[i]
			text += `<td${alignment ? ' align='+alignment: ""}>${stripSpace(row[i])}<td>\n`
		}
		if (row.length < tableData.headerCells.length) {
			text += ("<td></td>\n").repeat(tableData.headerCells.length - row.length)
		}
		text += "</tr>\n"
	}
	text += "</tbody>\n</table>\n"
	return text
}

function constructTableFrom(text: string) {
	const tableData:TableData = {headerCells: [], bodyCells: [], cellsAlignment: []}
	let tableRows = text.split(/(?:\r\n)|\n|\r/);
	if (tableRows[0] == text)
		return "";
	for (let i=0; i<tableRows.length; i++) {
		const cells = getRowContents(tableRows[i])
		if (cells.length === 0) {
			return "";
		}
		if (tableData.headerCells.length === 0) {
			if (cells.length === 0)
				return "";
			tableData.headerCells = [...cells]
		}else if (tableData.cellsAlignment.length === 0) {
			if (cells.length === 0 || cells.length !== tableData.headerCells.length)
				return "";
			tableData.cellsAlignment = cells.map((cell) => getCellAlignment(cell))
		}else if (cells.length === 0) {
			return "";
		}else {
			tableData.bodyCells.push(cells);
		}
	}
	return generateTableHtml(tableData);
}

export default function generateHtmlFromTree(rootNode: HtmlNode, indentLevel: number, linkRefs: LinkRef[], dangerousHtmlTags:string[]):string {
	let text = "";
	const whiteSpace = ' '.repeat(indentLevel);
	if (rootNode.nodeName === "paragraph" || (/h[1-6]/).test(rootNode.nodeName) || rootNode.nodeName === "plain text") {
		rootNode.textContent = parseInlineNodes(rootNode.textContent as string, linkRefs, dangerousHtmlTags);
		if ((/h[1-6]/).test(rootNode.nodeName))  {
			rootNode.textContent = rootNode.textContent.trimLeft();
		}
	}else if (["indented code block", "fenced code"].includes(rootNode.nodeName)) {
		rootNode.textContent = escapeSpecialCharacters(rootNode.textContent)
	}
	if (rootNode.nodeName === "html block") {
		text = `${whiteSpace}${rootNode.textContent}\n`
	}else if (rootNode.nodeName == "plain text") {
		text = rootNode.textContent ? `${whiteSpace}${rootNode.textContent}\n` : "";// TODO: Don't add if content is only comment
	}else if (rootNode.nodeName === "paragraph") {
		let tableHtml = constructTableFrom(rootNode.textContent)
		if (tableHtml) {
			text = tableHtml;
		}else text = rootNode.textContent ? `${whiteSpace}<p>${rootNode.textContent}</p>\n` : "";// TODO: Don't nest inside paragraphs if content is only comment
	}else if ((/h[1-6]/).test(rootNode.nodeName)) {
		const tag = rootNode.nodeName;
		text = `${whiteSpace}<${tag}>${rootNode.textContent}</${tag}>\n`
	}else if (rootNode.nodeName === "fenced code" || rootNode.nodeName === "indented code block") {
		text = `${whiteSpace}<pre class="${rootNode.infoString || ""}">\n${whiteSpace+'  '}<code>${rootNode.textContent}\n${whiteSpace+'  '}</code>\n${whiteSpace}</pre>\n`
	}else if (["hr"].includes(rootNode.nodeName)) {
		text = `${whiteSpace}<${rootNode.nodeName}>\n`
	}else {
		if (rootNode.nodeName === "ol") {
			text = `${whiteSpace}<${rootNode.nodeName} start="${rootNode.startNo}">\n`	
		}else text = `${whiteSpace}<${rootNode.nodeName}>\n`;

		if (rootNode.children.length === 1) {
			let onlyChild = rootNode.children[rootNode.children.length-1];
			text += `${generateHtmlFromTree(onlyChild, indentLevel+2, linkRefs, dangerousHtmlTags)}`;
		}else if (rootNode.children.length >= 1){
			for (const childNode of rootNode.children) {
				text += `${generateHtmlFromTree(childNode, indentLevel+2, linkRefs, dangerousHtmlTags)}`;
			}
		}else if (rootNode.textContent)
			text += `${whiteSpace + '  '}${rootNode.textContent}`;
		text += `${whiteSpace}</${rootNode.nodeName}>\n`
	}
	return text;
}

