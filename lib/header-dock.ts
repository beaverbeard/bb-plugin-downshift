const attribute='data-bb-header-addons';
/** Shared layout only: each independent plugin keeps ownership of its own child. */
export function headerParent():HTMLElement{
 const header=Array.from(document.querySelectorAll<HTMLElement>('[data-testid=app-page-header-content-row]')).find(item=>item.getClientRects().length>0);
 if(header)return header;
 let dock=document.querySelector<HTMLElement>(`[${attribute}]`);
 if(!dock){dock=document.createElement('div');dock.setAttribute(attribute,'');Object.assign(dock.style,{position:'fixed',top:'max(8px, env(safe-area-inset-top))',right:'max(48px, calc(env(safe-area-inset-right) + 44px))',display:'flex',alignItems:'center',gap:'4px',pointerEvents:'auto',zIndex:'90'});document.body.append(dock);}
 return dock;
}
export function releaseEmptyHeaderDock(){for(const dock of Array.from(document.querySelectorAll<HTMLElement>(`[${attribute}]`)))if(!dock.childElementCount)dock.remove();}
