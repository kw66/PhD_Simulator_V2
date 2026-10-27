import { createServer } from 'vite';
export async function loadEngine() {
 const server=await createServer({configFile:false,logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false,watch:null},appType:'custom'});
 const names=['content','engine','run-replay','local-replay','rule-context','role-talent-definitions','reading-system','research-operation','paper-rules','paper-collaboration','effective-attributes','buffs','ai-shop','ai-activation','part-time-work','monthly-effects','sanity-rules','san-recovery','role-talent-rest','role-talent-costs','shop-items','shop-transactions','lover-gift','coffee-system','thesis-rules','conference-catalog','event-choice-risk','engine-event-resolution','event-player-effects','advisor-progress','lab-projects','player-attributes','review-config','journal-system','calendar','role-talent-state','fixed-events-ccig-shared','advisor-guidance','fellow-actions','fellow-progression'];
 names.push('paper-competition','conference-system','conference-identity','internship-system','lover-progression','publication-fees','career-rules','graduation-career','monthly-career-events','publication-rules','publication-system','fixed-events-scholarship','academic-integrity');
 const E={};for(const name of names)Object.assign(E,await server.ssrLoadModule('/src/core/v2-'+name+'.ts'));
 return {E,loadModule:path=>server.ssrLoadModule(path),close:()=>server.close()};
}
