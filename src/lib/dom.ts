function NodeListToFirstElem(
    e: HTMLElement | NodeListOf<HTMLElement> | undefined
): HTMLElement | undefined {
    if (e instanceof NodeList) {
        return e.item(0);
    }
    return e;
}

function NodeListToArray(
    e: HTMLElement | NodeListOf<HTMLElement> | undefined
): HTMLElement[] | undefined {
    if (e instanceof NodeList) {
        return Array.from(e.values());
    }
    return [e] as HTMLElement[];
}
export function $(selector: string): HTMLElement | undefined {
    return NodeListToFirstElem(
        document.getElementById(selector) ||
            document.getElementsByName(selector) ||
            document.querySelector<HTMLElement>(selector)
    );
}

export function $$(selector: string): HTMLElement[] | undefined {
    return NodeListToArray(
        document.getElementById(selector) ||
            document.getElementsByName(selector) ||
            document.querySelector<HTMLElement>(selector)
    );
}
