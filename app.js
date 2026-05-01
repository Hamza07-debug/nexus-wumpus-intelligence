'use strict';

// ─── CONSTANTS ───────────────────────────────────────────
const CARDINAL = [[-1,0],[1,0],[0,-1],[0,1]];
const CYCLE_MS = 440;

// ─── TERRAIN ENGINE ──────────────────────────────────────
class TerrainEngine {
    constructor(h, w, trapCount, beastCount) {
        this.height = h; this.width = w;
        this.trapZones   = new Set();
        this.beastZones  = new Set();
        this.liveBeastZones = new Set();
        this.goldCell    = null;
        this._build(trapCount, beastCount);
    }

    adjacentCells(r, c) {
        return CARDINAL.map(([dr,dc]) => [r+dr, c+dc])
            .filter(([nr,nc]) => nr>=1&&nr<=this.height&&nc>=1&&nc<=this.width);
    }

    _build(trapCount, beastCount) {
        const origin = '1,1';
        const safeZone = new Set(this.adjacentCells(1,1).map(([r,c])=>`${r},${c}`));
        safeZone.add(origin);
        const allCells = [];
        for (let r=1;r<=this.height;r++) for (let c=1;c<=this.width;c++) if(`${r},${c}`!==origin) allCells.push(`${r},${c}`);
        const trapPool = _shuffle(allCells.filter(k=>!safeZone.has(k)));
        trapPool.slice(0, Math.min(trapCount, trapPool.length)).forEach(k=>this.trapZones.add(k));
        const beastPool = _shuffle(allCells.filter(k=>!this.trapZones.has(k)&&!safeZone.has(k)));
        beastPool.slice(0, Math.min(beastCount, beastPool.length)).forEach(k=>{ this.beastZones.add(k); this.liveBeastZones.add(k); });
        const goldPool = _shuffle(allCells.filter(k=>{
            if(this.trapZones.has(k)||this.beastZones.has(k)) return false;
            const [r,c]=k.split(',').map(Number);
            return this.adjacentCells(r,c).some(([nr,nc])=>!this.trapZones.has(`${nr},${nc}`));
        }));
        this.goldCell = goldPool[0] || _shuffle(allCells.filter(k=>!this.trapZones.has(k)&&!this.beastZones.has(k)))[0];
    }

    hasWind(r,c)  { return this.adjacentCells(r,c).some(([nr,nc])=>this.trapZones.has(`${nr},${nc}`)); }
    hasOdor(r,c)  { return this.liveBeastZones.size>0 && this.adjacentCells(r,c).some(([nr,nc])=>this.liveBeastZones.has(`${nr},${nc}`)); }
    hasGlimmer(r,c){ return this.goldCell===`${r},${c}`; }
}

// ─── BELIEF STORE (KB) ───────────────────────────────────
class BeliefStore {
    constructor() { this.clauses=[]; this.registry=new Set(); this.operationCount=0; }

    _key(cl) { return [...cl].sort().join('|'); }
    _negate(lit) { return lit.startsWith('-') ? lit.slice(1) : '-'+lit; }

    commit(literals) {
        const cl = new Set(literals);
        for(const l of cl) if(cl.has(this._negate(l))) return;
        const k = this._key(cl);
        if(this.registry.has(k)) return;
        for(const ex of this.clauses) if([...ex].every(l=>cl.has(l))) return;
        this.clauses = this.clauses.filter(ex=>{
            const sub = [...cl].every(l=>ex.has(l));
            if(sub) this.registry.delete(this._key(ex));
            return !sub;
        });
        this.clauses.push(cl); this.registry.add(k);
    }

    query(literal, cap=5000) {
        const hyp = new Set([this._negate(literal)]);
        const sos = [hyp];
        const visited = new Set([this._key(hyp)]);
        let ops = 0;
        for(let i=0; i<sos.length && ops<cap; i++) {
            const c1 = sos[i];
            for(const lit of c1) {
                const opp = this._negate(lit);
                for(const c2 of [...this.clauses, ...sos]) {
                    if(!c2.has(opp)) continue;
                    ops++; this.operationCount++;
                    const merged = new Set([...c1,...c2]);
                    merged.delete(lit); merged.delete(opp);
                    if(merged.size===0) return true;
                    let taut=false;
                    for(const l of merged) if(merged.has(this._negate(l))){ taut=true; break; }
                    if(taut) continue;
                    const mk=this._key(merged);
                    if(!visited.has(mk)){ visited.add(mk); sos.push(merged); }
                    if(ops>=cap) return false;
                }
            }
        }
        return false;
    }

    encodePercepts(r, c, terrain) {
        this.commit([`-TRAP_${r}_${c}`]);
        this.commit([`-BEAST_${r}_${c}`]);
        const nbrs = terrain.adjacentCells(r,c);
        const W=`WIND_${r}_${c}`, O=`ODOR_${r}_${c}`;
        if(nbrs.length>0){
            this.commit([`-${W}`, ...nbrs.map(([nr,nc])=>`TRAP_${nr}_${nc}`)]);
            nbrs.forEach(([nr,nc])=>this.commit([`-TRAP_${nr}_${nc}`,W]));
            this.commit([`-${O}`, ...nbrs.map(([nr,nc])=>`BEAST_${nr}_${nc}`)]);
            nbrs.forEach(([nr,nc])=>this.commit([`-BEAST_${nr}_${nc}`,O]));
        }
        const wind=terrain.hasWind(r,c), odor=terrain.hasOdor(r,c), glimmer=terrain.hasGlimmer(r,c);
        this.commit([wind ? W : `-${W}`]);
        this.commit([odor ? O : `-${O}`]);
        return { wind, odor, glimmer };
    }

    renderFormulas() {
        if(!this.clauses.length) return 'No clauses yet.';
        return this.clauses.map((cl,i)=>{
            const lits=[...cl].sort().map(l=>{
                const neg=l.startsWith('-'); const atom=neg?l.slice(1):l;
                return `${neg?'¬':''}${atom.replace(/_(\\d+)_(\\d+)$/,'_$1,$2')}`;
            });
            return `${i+1}. ${lits.length===1?lits[0]:`(${lits.join(' ∨ ')})`}`;
        }).join('\n');
    }
}

// ─── EXPLORER UNIT ───────────────────────────────────────
class ExplorerUnit {
    constructor() {
        this.row=1; this.col=1;
        this.discoveredCells = new Set(['1,1']);
        this.confirmedSafe   = new Set(['1,1']);
        this.confirmedPeril  = new Set();
        this.goldLocation    = null;
        this.scheduledRoute  = [];
        this.sensorLog       = ['None'];
        this.terminated      = false;
        this.victorious      = false;
        this.carriesGold     = false;
        this.arrowLoaded     = true;
        this.immobilized     = false;
        this.inferenceLog    = [];
        this.moveCount       = 0;
    }

    runInference(terrain, kb) {
        const results = [];
        for(let r=1;r<=terrain.height;r++) {
            for(let c=1;c<=terrain.width;c++) {
                const k=`${r},${c}`;
                if(this.confirmedSafe.has(k)||this.confirmedPeril.has(k)) continue;
                const noTrap=kb.query(`-TRAP_${r}_${c}`), noBeast=kb.query(`-BEAST_${r}_${c}`);
                if(noTrap&&noBeast){ this.confirmedSafe.add(k); results.push({cell:k,verdict:'SAFE'}); }
                else {
                    const hasTrap=kb.query(`TRAP_${r}_${c}`), hasBeast=kb.query(`BEAST_${r}_${c}`);
                    if(hasTrap||hasBeast){ this.confirmedPeril.add(k); results.push({cell:k,verdict:'HAZARD'}); }
                }
            }
        }
        this.inferenceLog = results;
        return results;
    }

    attemptProjectile(terrain, kb) {
        if(!this.arrowLoaded) return false;
        let dir=null;
        for(let r=1;r<=terrain.height;r++){
            if(r===this.row) continue;
            if(kb.query(`BEAST_${r}_${this.col}`)){ dir=[r>this.row?1:-1,0]; break; }
        }
        if(!dir) for(let c=1;c<=terrain.width;c++){
            if(c===this.col) continue;
            if(kb.query(`BEAST_${this.row}_${c}`)){ dir=[0,c>this.col?1:-1]; break; }
        }
        if(!dir){
            const hasOdor=kb.clauses.some(cl=>cl.size===1&&[...cl][0]===`ODOR_${this.row}_${this.col}`);
            if(hasOdor){
                outer: for(const [dr,dc] of CARDINAL){
                    let r=this.row+dr, c=this.col+dc;
                    while(r>=1&&r<=terrain.height&&c>=1&&c<=terrain.width){
                        if(this.confirmedPeril.has(`${r},${c}`)){ dir=[dr,dc]; break outer; }
                        r+=dr; c+=dc;
                    }
                }
            }
        }
        if(!dir) return false;
        this.arrowLoaded=false;
        let ar=this.row+dir[0], ac=this.col+dir[1], hit=false;
        while(ar>=1&&ar<=terrain.height&&ac>=1&&ac<=terrain.width){
            if(terrain.liveBeastZones.has(`${ar},${ac}`)){ hit=true; break; }
            ar+=dir[0]; ac+=dir[1];
        }
        if(hit){
            const hk=`${ar},${ac}`; terrain.liveBeastZones.delete(hk);
            kb.commit([`-BEAST_${ar}_${ac}`]);
            if(terrain.liveBeastZones.size===0){
                for(let r=1;r<=terrain.height;r++) for(let c=1;c<=terrain.width;c++) kb.commit([`-BEAST_${r}_${c}`]);
                this.confirmedPeril=new Set([...this.confirmedPeril].filter(k=>{ const[r,c]=k.split(',').map(Number); return kb.query(`TRAP_${r}_${c}`); }));
                this.sensorLog.push('🔊 Last beast eliminated!');
            } else this.sensorLog.push('🔊 Beast hit!');
        } else {
            let r=this.row+dir[0], c=this.col+dir[1];
            while(r>=1&&r<=terrain.height&&c>=1&&c<=terrain.width){ kb.commit([`-BEAST_${r}_${c}`]); r+=dir[0]; c+=dir[1]; }
            this.sensorLog.push('Arrow missed.');
        }
        return true;
    }
}

// ─── NAVIGATION PLANNER ──────────────────────────────────
class NavigationPlanner {
    static routeTo(unit, terrain, goalKey) {
        const start=`${unit.row},${unit.col}`;
        if(start===goalKey) return [];
        const queue=[{r:unit.row,c:unit.col,path:[]}];
        const seen=new Set([start]);
        while(queue.length){
            const {r,c,path}=queue.shift();
            for(const[nr,nc] of terrain.adjacentCells(r,c)){
                const nk=`${nr},${nc}`;
                if(seen.has(nk)||!unit.confirmedSafe.has(nk)) continue;
                seen.add(nk);
                const newPath=[...path,nk];
                if(nk===goalKey) return newPath;
                queue.push({r:nr,c:nc,path:newPath});
            }
        }
        return [];
    }

    static computeNextRoute(unit, terrain) {
        const frontier=[...unit.confirmedSafe].filter(k=>!unit.discoveredCells.has(k));
        if(!frontier.length) return [];
        const scored=_shuffle(frontier).map(k=>{
            const[r,c]=k.split(',').map(Number);
            const unknownNeighbors=terrain.adjacentCells(r,c).filter(([nr,nc])=>{
                const nk=`${nr},${nc}`;
                return !unit.confirmedSafe.has(nk)&&!unit.confirmedPeril.has(nk);
            }).length;
            return {k,score:unknownNeighbors};
        });
        scored.sort((a,b)=>b.score-a.score);
        for(const{k}of scored){ const p=NavigationPlanner.routeTo(unit,terrain,k); if(p.length) return p; }
        return [];
    }
}

// ─── HELPERS ─────────────────────────────────────────────
function _shuffle(arr) {
    for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; }
    return arr;
}
function _clamp(v,lo,hi){ return Math.min(hi,Math.max(lo,v)); }

// ─── SIMULATION CONTROLLER ───────────────────────────────
class SimulationController {
    constructor() {
        this.terrain   = null;
        this.explorer  = null;
        this.beliefBase= null;
        this.loopTimer = null;
        this.revealMode= false;
        this._bindDOM();
        this._bindEvents();
    }

    _bindDOM() {
        const $ = id => document.getElementById(id);
        this.ui = {
            matrix:        $('cellMatrix'),
            btnInit:       $('btnInitialize'),
            btnStep:       $('btnAdvance'),
            btnAuto:       $('btnAutomate'),
            btnReset:      $('btnReset'),
            btnReveal:     $('btnReveal'),
            btnRestart:    $('btnRestart'),
            valPos:        $('valPosition'),
            valMoves:      $('valMoves'),
            valKB:         $('valKBSize'),
            valRes:        $('valResolutions'),
            valStatus:     $('valStatus'),
            perceptBox:    $('perceptDisplay'),
            deductCount:   $('deductionCount'),
            deductFeed:    $('deductionFeed'),
            formulaViewer: $('formulaViewer'),
            outcomeLayer:  $('outcomeOverlay'),
            outcomeIcon:   $('outcomeIcon'),
            outcomeHead:   $('outcomeHeading'),
            outcomeMsg:    $('outcomeMessage'),
            methodToggle:  $('methodologyToggle'),
            methodBody:    $('methodologyBody'),
            chevron:       $('toggleChevron'),
        };
    }

    _bindEvents() {
        this.ui.btnInit.addEventListener('click', () => this.initialize());
        this.ui.btnStep.addEventListener('click', () => this.tick());
        this.ui.btnAuto.addEventListener('click', () => this.toggleLoop());
        this.ui.btnReset.addEventListener('click', () => this.initialize());
        this.ui.btnRestart.addEventListener('click', () => this.initialize());
        this.ui.btnReveal.addEventListener('click', () => { this.revealMode=!this.revealMode; this.ui.btnReveal.classList.toggle('engaged',this.revealMode); this.render(); });
        this.ui.methodToggle.addEventListener('click', () => {
            const open = this.ui.methodBody.classList.toggle('visible');
            this.ui.chevron.classList.toggle('expanded', open);
        });
    }

    initialize() {
        const h  = _clamp(parseInt(document.getElementById('cfgHeight')?.value)||4,3,8);
        const w  = _clamp(parseInt(document.getElementById('cfgWidth')?.value)||4,3,8);
        const t  = _clamp(parseInt(document.getElementById('cfgTraps')?.value)||2,0,(h*w)-2);
        const b  = _clamp(parseInt(document.getElementById('cfgBeasts')?.value)||1,0,(h*w)-2-t);
        this.stopLoop();
        this.terrain    = new TerrainEngine(h,w,t,b);
        this.explorer   = new ExplorerUnit();
        this.beliefBase = new BeliefStore();
        const s = this.beliefBase.encodePercepts(1,1,this.terrain);
        this.explorer.sensorLog = _buildSensorLog(s);
        this.explorer.runInference(this.terrain, this.beliefBase);
        this.ui.btnStep.disabled = false;
        this.ui.outcomeLayer.classList.add('concealed');
        this.render();
    }

    tick() {
        const ex=this.explorer, tr=this.terrain, kb=this.beliefBase;
        if(!tr||ex.terminated||ex.victorious||ex.immobilized) return;
        ex.moveCount++;

        if(ex.scheduledRoute.length===0){
            ex.scheduledRoute = NavigationPlanner.computeNextRoute(ex,tr);
            if(ex.scheduledRoute.length===0){
                if(ex.arrowLoaded){
                    const fired=ex.attemptProjectile(tr,kb);
                    if(fired){ ex.runInference(tr,kb); ex.scheduledRoute=NavigationPlanner.computeNextRoute(ex,tr); if(ex.scheduledRoute.length>0){ this.render(); return; } }
                }
                ex.immobilized=true; this.stopLoop(); this.render(); return;
            }
        }

        const dest=ex.scheduledRoute.shift();
        const[nr,nc]=dest.split(',').map(Number);
        const freshCell=!ex.discoveredCells.has(dest);
        ex.row=nr; ex.col=nc; ex.discoveredCells.add(dest);

        if(tr.trapZones.has(dest)){
            ex.terminated=true; ex.sensorLog=['Fell into a trap!'];
        } else if(tr.liveBeastZones.has(dest)){
            ex.terminated=true; ex.sensorLog=['Consumed by a beast!'];
        } else {
            ex.confirmedSafe.add(dest);
            const s=kb.encodePercepts(nr,nc,tr);
            ex.sensorLog=_buildSensorLog(s);
            if(s.glimmer&&!ex.carriesGold){ ex.carriesGold=true; ex.goldLocation=dest; ex.victorious=true; ex.sensorLog=['✨ Gold acquired!']; ex.scheduledRoute=[]; }
        }

        if(!ex.terminated&&!ex.victorious) ex.runInference(tr,kb);
        if(freshCell&&!ex.victorious) ex.scheduledRoute=[];
        this.render();
    }

    toggleLoop() {
        if(this.loopTimer){ this.stopLoop(); return; }
        if(!this.terrain||this.explorer.terminated||this.explorer.victorious||this.explorer.immobilized) return;
        this.ui.btnAuto.classList.add('engaged');
        this.ui.btnAuto.textContent='Stop';
        this.loopTimer=setInterval(()=>{
            if(!this.terrain||this.explorer.terminated||this.explorer.victorious||this.explorer.immobilized){ this.stopLoop(); return; }
            this.tick();
        }, CYCLE_MS);
    }

    stopLoop() {
        if(this.loopTimer){ clearInterval(this.loopTimer); this.loopTimer=null; }
        this.ui.btnAuto.classList.remove('engaged');
        this.ui.btnAuto.textContent='Auto Run';
    }

    render() {
        if(!this.terrain) return;
        const {terrain:tr, explorer:ex, beliefBase:kb} = this;
        const cols=tr.width;
        const mat=this.ui.matrix;
        mat.style.gridTemplateColumns=`repeat(${cols},1fr)`;
        mat.innerHTML='';

        for(let r=1;r<=tr.height;r++){
            for(let c=1;c<=tr.width;c++){
                const key=`${r},${c}`;
                const isAgent=ex.row===r&&ex.col===c;
                const seen=ex.discoveredCells.has(key)||this.revealMode;
                const isTrap=tr.trapZones.has(key);
                const isBeast=tr.beastZones.has(key);
                const isLiveBeast=tr.liveBeastZones.has(key);
                const isPeril=ex.confirmedPeril.has(key)||(seen&&(isTrap||isLiveBeast));
                const isGoldFound=key===ex.goldLocation;

                const cell=document.createElement('div');
                cell.className='matrix-cell';

                if(isAgent){
                    cell.classList.add('explorer-here');
                    if(ex.terminated) cell.classList.add('terminated');
                    else if(ex.victorious) cell.classList.add('victorious');
                } else if(seen&&isTrap){
                    cell.classList.add('trap-revealed');
                } else if(seen&&isLiveBeast){
                    cell.classList.add('beast-revealed');
                } else if(isGoldFound){
                    cell.classList.add('treasure-state');
                } else if(isPeril){
                    cell.classList.add('hazard-state');
                } else if(ex.discoveredCells.has(key)){
                    cell.classList.add('visited-state');
                }

                const coord=document.createElement('span');
                coord.className='cell-coord';
                coord.textContent=`${r},${c}`;
                cell.appendChild(coord);

                let emblem='';
                if(isAgent) emblem = ex.terminated?'💀':(ex.victorious?'🏆':'◆');
                else if(seen&&isTrap) emblem='🕳';
                else if(seen&&isBeast&&isLiveBeast) emblem='W';
                else if(seen&&isBeast&&!isLiveBeast) emblem='☠';
                else if(isGoldFound) emblem='★';
                else if(ex.confirmedPeril.has(key)) emblem='!';

                if(emblem){ const em=document.createElement('span'); em.className='cell-emblem'; em.textContent=emblem; cell.appendChild(em); }
                mat.appendChild(cell);
            }
        }

        // Telemetry
        this.ui.valPos.textContent=`(${ex.row}, ${ex.col})`;
        this.ui.valMoves.textContent=ex.moveCount;
        this.ui.valKB.textContent=kb.clauses.length;
        this.ui.valRes.textContent=kb.operationCount;

        let statusTxt='Exploring';
        if(ex.terminated) statusTxt='Terminated';
        else if(ex.victorious) statusTxt='Mission Complete';
        else if(ex.immobilized) statusTxt='Immobilized';
        this.ui.valStatus.textContent=statusTxt;

        // Percepts
        const percepts=ex.sensorLog;
        this.ui.perceptBox.innerHTML=percepts.map(p=>{
            let cls='percept-tag';
            if(p.includes('Wind')||p.includes('Breeze')) cls+=' active-breeze';
            else if(p.includes('Stench')||p.includes('Odor')) cls+=' active-stench';
            else if(p.includes('Gold')||p.includes('✨')) cls+=' active-glitter';
            return `<span class="${cls}">${p}</span>`;
        }).join('');

        // Deductions
        const ded=ex.inferenceLog;
        if(!ded.length){
            this.ui.deductCount.textContent='No new entailments this step.';
            this.ui.deductFeed.innerHTML='<div class="deduction-entry empty-result">KB inconclusive for remaining cells.</div>';
        } else {
            this.ui.deductCount.textContent=`Latest inference: ${ded.length} result(s)`;
            this.ui.deductFeed.innerHTML=ded.map(d=>`<div class="deduction-entry ${d.verdict==='SAFE'?'safe-result':'hazard-result'}">${d.cell} → ${d.verdict}</div>`).join('');
        }

        // CNF
        this.ui.formulaViewer.textContent=kb.renderFormulas();

        // Modal
        if(ex.terminated||ex.victorious||ex.immobilized){
            this.ui.btnStep.disabled=true;
            this.stopLoop();
            this.ui.outcomeLayer.classList.remove('concealed');
            if(ex.victorious){ this.ui.outcomeIcon.textContent='🏆'; this.ui.outcomeHead.textContent='Mission Complete'; this.ui.outcomeMsg.textContent='Gold secured. The agent navigated the hazards successfully.'; }
            else if(ex.terminated){ this.ui.outcomeIcon.textContent='💀'; this.ui.outcomeHead.textContent='Agent Terminated'; this.ui.outcomeMsg.textContent=ex.sensorLog[0]||'The simulation ended unexpectedly.'; }
            else { this.ui.outcomeIcon.textContent='⚠️'; this.ui.outcomeHead.textContent='Agent Immobilized'; this.ui.outcomeMsg.textContent='No provably safe moves remain. KB cannot resolve further.'; }
        } else {
            this.ui.outcomeLayer.classList.add('concealed');
        }
    }
}

function _buildSensorLog({wind,odor,glimmer}){
    const out=[];
    if(wind) out.push('Wind (Breeze)');
    if(odor) out.push('Odor (Stench)');
    if(glimmer) out.push('Glimmer (Gold)');
    return out.length ? out : ['None'];
}

// ─── BOOT ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const sim = new SimulationController();
    sim.initialize();
});