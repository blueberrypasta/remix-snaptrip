/* global window, document, localStorage, TESTS */
(function(){
  'use strict';
  var STORAGE_KEY_DATE='babyDueDate';
  var STORAGE_KEY_COMPLETED='prenatalCompleted_v2';
  var activeFilter='all';
  var calculatedCurrentWeek=null;

  var completedMemory=[];
  try {var parsed=JSON.parse(localStorage.getItem(STORAGE_KEY_COMPLETED)||'[]'); if(Array.isArray(parsed))completedMemory=parsed.map(String);}catch{/* Storage may be unavailable; the current session still works. */}
  function getCompletedList(){return completedMemory.slice();}
  function saveCompletedList(list){completedMemory=list.map(String);try{localStorage.setItem(STORAGE_KEY_COMPLETED,JSON.stringify(completedMemory));}catch{/* Storage may be unavailable; the current session still works. */}}

  function isTestCompleted(id){
    return getCompletedList().indexOf(String(id))!==-1;
  }

  function setTestCompleted(id,completed){
    var list=getCompletedList();
    id=String(id);
    var idx=list.indexOf(id);
    if(completed){
      if(idx===-1)list.push(id);
    }else{
      if(idx!==-1)list.splice(idx,1);
    }
    saveCompletedList(list);
  }

  function announceLive(msg){
    var el=document.getElementById('prenatalLiveRegion');
    if(el){ el.textContent=''; el.textContent=msg; }
  }

  function injectStaticNavAndHeader(){
    if(!document.getElementById('prenatalTopNav')){
      var nav=document.createElement('nav');
      nav.id='prenatalTopNav';
      nav.className='prenatal-site-nav';
      nav.setAttribute('aria-label','주요 사이트 링크');
      nav.innerHTML='<a href="https://todaynamgaju.com" target="_blank" rel="noopener">오늘의 남가주</a><a href="/">SlapTrip</a>';
      document.body.insertBefore(nav,document.body.firstChild);
    }

    var hero=document.querySelector('.hero');
    if(hero && !document.getElementById('heroEyebrow')){
      var h1=hero.querySelector('h1');
      var p=hero.querySelector('p');
      if(h1) h1.textContent='한눈에 보는 산전검사';
      if(p) p.textContent='예정일에 맞춰 살펴보고, 진료에서 확인하세요.';
      var eyebrow=document.createElement('div');
      eyebrow.id='heroEyebrow';
      eyebrow.className='hero-eyebrow';
      eyebrow.textContent='PRENATAL / YOUR CARE NOTES';
      if(h1) hero.insertBefore(eyebrow,h1);

      var aside=document.createElement('aside');
      aside.className='trimester-overview-aside';
      aside.setAttribute('aria-label','임신 분기 개요');
      aside.innerHTML='<div class="tm-step"><span class="tm-num">01</span><span class="tm-label">초기 1~13주</span></div><div class="tm-step"><span class="tm-num">02</span><span class="tm-label">중기 14~27주</span></div><div class="tm-step"><span class="tm-num">03</span><span class="tm-label">후기 28~40주+</span></div>';
      hero.appendChild(aside);
    }

    var statusInfo=document.getElementById('statusInfo');
    if(statusInfo && !document.getElementById('prenatalClearDataBar')){
      var clearBar=document.createElement('div');
      clearBar.id='prenatalClearDataBar';
      clearBar.className='storage-privacy-bar';
      clearBar.innerHTML='<span>예정일과 완료 표시는 이 브라우저에만 저장돼요.</span><button type="button" class="btn-text-clear" id="clearPrenatalDataBtn">저장된 기록 초기화</button>';
      document.querySelector('.status-bar').appendChild(clearBar);
      var clearBtn=document.getElementById('clearPrenatalDataBtn');
      if(clearBtn){
        clearBtn.addEventListener('click',function(){
          if(window.confirm('저장된 출산 예정일과 검사 완료 기록을 모두 삭제할까요?')){
            try{ localStorage.removeItem(STORAGE_KEY_DATE); }catch{/* Storage may be unavailable; the current session still works. */}
            try{ localStorage.removeItem(STORAGE_KEY_COMPLETED); }catch{/* Storage may be unavailable; the current session still works. */}
            completedMemory=[];
            var input=document.getElementById('dueDate');
            if(input) input.value='';
            window.updateTimeline();
            announceLive('저장된 기록이 초기화되었습니다.');
          }
        });
      }
    }

    var statusBar=document.querySelector('.status-bar');
    if(statusBar && !document.getElementById('nextVisitSummary')){
      var nextDiv=document.createElement('div');
      nextDiv.id='nextVisitSummary';
      statusBar.parentNode.insertBefore(nextDiv,statusBar.nextSibling);
    }

    if(!document.getElementById('prenatalLiveRegion')){
      var live=document.createElement('div');
      live.id='prenatalLiveRegion';
      live.className='sr-only';
      live.setAttribute('role','status');
      live.setAttribute('aria-live','polite');
      document.body.appendChild(live);
    }

    var dateGroup=document.querySelector('.date-input-group');
    if(dateGroup && !document.getElementById('dueDateError')){
      var err=document.createElement('div');
      err.id='dueDateError';
      err.className='date-input-error';
      err.setAttribute('role','alert');
      dateGroup.appendChild(err);
    }

    var tables=document.querySelectorAll('.compare-table');
    for(var t=0;t<tables.length;t++){
      var tbl=tables[t];
      if(tbl.parentNode && !tbl.parentNode.classList.contains('compare-table-wrapper')){
        var wrap=document.createElement('div');
        wrap.className='compare-table-wrapper';
        tbl.parentNode.insertBefore(wrap,tbl);
        wrap.appendChild(tbl);
      }
    }
  }

  function getUtcDateSerial(year,monthZeroBased,day){
    return Math.floor(Date.UTC(year,monthZeroBased,day)/(24*60*60*1000));
  }

  function getCategoryLabel(cat){
    var c=(cat||'').toLowerCase();
    if(c==='ultrasound') return '초음파';
    if(c==='blood') return '혈액/유전';
    if(c==='vaccine') return '예방접종';
    return '일반검진';
  }

  function updateNextVisitSummary(currentWeek){
    var summaryContainer=document.getElementById('nextVisitSummary');
    if(!summaryContainer)return;
    if(typeof currentWeek!=='number'||isNaN(currentWeek)){
      summaryContainer.innerHTML='<div class="next-summary-card"><div class="next-summary-left"><span class="next-summary-tag">안내</span><span class="next-summary-title">출산 예정일을 입력하시면 지금 필요한 검사 일정을 정리해 드립니다.</span></div></div>';
      return;
    }
    if(!TESTS||!TESTS.length){
      summaryContainer.innerHTML='';
      return;
    }
    var activeTests=TESTS.filter(function(t){
      return currentWeek>=t.weekStart && currentWeek<=t.weekEnd && !isTestCompleted(t.id);
    });
    var targetTest=null;
    var headerText;
    if(activeTests.length>0){
      targetTest=activeTests[0];
      var names=activeTests.map(function(t){ return t.title; }).join(', ');
      headerText=names;
    }else{
      var futureTests=TESTS.filter(function(t){
        return t.weekStart>currentWeek && !isTestCompleted(t.id);
      });
      if(futureTests.length>0){
        targetTest=futureTests[0];
        headerText='다음 권장 검사 ('+targetTest.weekStart+'주~): '+targetTest.title;
      }else{
        summaryContainer.innerHTML='<div class="next-summary-card"><div class="next-summary-left"><span class="next-summary-tag">안내</span><span class="next-summary-title">모든 주요 권장 검사 일정을 확인하셨습니다. 정기 진료 일정을 유지하세요.</span></div></div>';
        return;
      }
    }
    summaryContainer.innerHTML='<div class="next-summary-card"><div class="next-summary-left"><span class="next-summary-tag">지금 살펴볼 항목</span><span class="next-summary-title">'+headerText+'</span></div><button type="button" class="btn-jump-test" data-target-id="'+(targetTest?targetTest.id:'')+'">해당 항목으로 이동</button></div>';
    var jumpBtn=summaryContainer.querySelector('.btn-jump-test');
    if(jumpBtn && targetTest){
      jumpBtn.addEventListener('click',function(){
        var el=document.getElementById('test-'+targetTest.id);
        if(el){
          el.scrollIntoView({behavior:'smooth',block:'center'});
          var hdr=el.querySelector('.test-card-header');
          if(hdr) hdr.focus();
        }
      });
    }
  }

  window.toggleDetails=function(headerEl){
    if(!headerEl)return;
    var card=headerEl.closest('.test-card');
    if(!card)return;
    var details=card.querySelector('.test-details');
    var chevron=headerEl.querySelector('.chevron');
    var isExpanded=headerEl.getAttribute('aria-expanded')==='true';
    var nextState=!isExpanded;
    headerEl.setAttribute('aria-expanded',String(nextState));
    if(details){
      details.hidden=!nextState;
      details.style.display=nextState?'block':'none';
    }
    if(chevron){
      if(nextState) chevron.classList.add('open');
      else chevron.classList.remove('open');
    }
  };

  window.renderTimeline=function(currentWeek){
    calculatedCurrentWeek=currentWeek;
    var timeline=document.getElementById('timeline');
    if(!timeline||!TESTS)return;
    timeline.innerHTML='';

    var trimesters=[
      {name:'1분기 (초기 · 1~13주)',tests:TESTS.filter(function(t){return t.trimester===1;})},
      {name:'2분기 (중기 · 14~27주)',tests:TESTS.filter(function(t){return t.trimester===2;})},
      {name:'3분기 (후기 · 28주 이후)',tests:TESTS.filter(function(t){return t.trimester===3;})}
    ];

    trimesters.forEach(function(tm){
      if(!tm.tests||!tm.tests.length)return;
      var tmHeader=document.createElement('div');
      tmHeader.className='trimester-header';
      tmHeader.textContent=tm.name;
      timeline.appendChild(tmHeader);

      tm.tests.forEach(function(test){
        var isChecked=isTestCompleted(test.id);
        var statusClass='upcoming';
        var badgeText='예정';
        var badgeClass='badge-upcoming';

        if(typeof currentWeek==='number'&&!isNaN(currentWeek)){
          if(currentWeek>test.weekEnd){
            statusClass='done';
            badgeText='권장 시기 지남';
            badgeClass='badge-done';
          }else if(currentWeek>=test.weekStart){
            statusClass='current';
            badgeText='권장 시기';
            badgeClass='badge-current';
          }
        }

        if(isChecked){
          badgeText='직접 완료 표시';
          badgeClass='badge-manual';
        }

        var card=document.createElement('div');
        card.className='test-card '+statusClass+(isChecked?' is-complete':'');
        card.id='test-'+test.id;
        card.setAttribute('data-status',statusClass);
        card.setAttribute('data-category',test.category||'');

        var headerBtn=document.createElement('div');
        headerBtn.className='test-card-header';
        headerBtn.setAttribute('role','button');
        headerBtn.setAttribute('tabindex','0');
        headerBtn.setAttribute('aria-expanded','false');
        headerBtn.setAttribute('aria-controls','details-'+test.id);

        var catSpan=document.createElement('span');
        catSpan.className='test-cat-tag';
        catSpan.textContent=getCategoryLabel(test.category);
        headerBtn.appendChild(catSpan);

        var testInfo=document.createElement('div');
        testInfo.className='test-info';
        var weekSpan=document.createElement('div');
        weekSpan.className='test-week';
        weekSpan.textContent=test.weekStart===test.weekEnd?test.weekStart+'주':test.weekStart+'~'+test.weekEnd+'주';
        testInfo.appendChild(weekSpan);

        var h3=document.createElement('h3');
        h3.appendChild(document.createTextNode(test.title+' '));
        if(test.titleEn){
          var enSpan=document.createElement('span');
          enSpan.className='en';
          enSpan.textContent=test.titleEn;
          h3.appendChild(enSpan);
        }
        testInfo.appendChild(h3);

        if(test.desc){
          var descDiv=document.createElement('div');
          descDiv.className='test-desc';
          descDiv.textContent=test.desc;
          testInfo.appendChild(descDiv);
        }
        headerBtn.appendChild(testInfo);

        var actionsDiv=document.createElement('div');
        actionsDiv.className='card-header-actions';

        var chkLabel=document.createElement('label');
        chkLabel.className='manual-complete-wrap';
        chkLabel.title='이 검사를 완료로 표시';
        var chk=document.createElement('input');
        chk.type='checkbox';
        chk.checked=isChecked;
        chk.setAttribute('aria-label',test.title+' 검사 완료로 기록');
        chkLabel.appendChild(chk);
        var chkText=document.createElement('span');
        chkText.textContent='검사 완료로 기록';
        chkLabel.appendChild(chkText);

        chkLabel.addEventListener('click',function(e){ e.stopPropagation(); });
        chk.addEventListener('change',function(e){
          e.stopPropagation();
          var checked=chk.checked;
          setTestCompleted(test.id,checked);
          if(checked){
            card.classList.add('is-complete');
            badge.textContent='직접 완료 표시';
            badge.className='test-badge badge-manual';
            announceLive(test.title+' 검사를 완료로 기록했습니다.');
          }else{
            card.classList.remove('is-complete');
            if(typeof currentWeek==='number'&&!isNaN(currentWeek)){
              if(currentWeek>test.weekEnd){
                badge.textContent='권장 시기 지남';
                badge.className='test-badge badge-done';
              }else if(currentWeek>=test.weekStart){
                badge.textContent='권장 시기';
                badge.className='test-badge badge-current';
              }else{
                badge.textContent='예정';
                badge.className='test-badge badge-upcoming';
              }
            }else{
              badge.textContent='예정';
              badge.className='test-badge badge-upcoming';
            }
            announceLive(test.title+' 검사 완료 표시를 취소했습니다.');
          }
          applyActiveFilter();
          updateNextVisitSummary(calculatedCurrentWeek);
        });
        actionsDiv.appendChild(chkLabel);

        var badge=document.createElement('span');
        badge.className='test-badge '+badgeClass;
        badge.textContent=badgeText;
        actionsDiv.appendChild(badge);
        headerBtn.appendChild(actionsDiv);

        var chevron=document.createElement('div');
        chevron.className='chevron';
        chevron.setAttribute('aria-hidden','true');
        chevron.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
        headerBtn.appendChild(chevron);

        headerBtn.addEventListener('click',function(){ window.toggleDetails(headerBtn); });
        headerBtn.addEventListener('keydown',function(e){
          if(e.target!==headerBtn)return;
          if(e.key==='Enter'||e.key===' '||e.key==='Spacebar'){
            e.preventDefault();
            window.toggleDetails(headerBtn);
          }
        });
        card.appendChild(headerBtn);

        var details=document.createElement('div');
        details.className='test-details';
        details.id='details-'+test.id;
        details.hidden=true;
        details.style.display='none';
        var inner=document.createElement('div');
        inner.className='test-details-inner';
        inner.innerHTML=test.details||'';
        details.appendChild(inner);
        card.appendChild(details);

        timeline.appendChild(card);
      });
    });

    applyActiveFilter();
    updateNextVisitSummary(currentWeek);
  };

  function applyActiveFilter(){
    var cards=document.querySelectorAll('#timeline .test-card');
    cards.forEach(function(card){
      var testId=card.id.replace('test-','');
      var category=card.getAttribute('data-category');
      var status=card.getAttribute('data-status');
      var isDone=isTestCompleted(testId);

      var visible=false;
      if(activeFilter==='all'){
        visible=true;
      }else if(activeFilter==='done'){
        visible=isDone;
      }else if(activeFilter==='current'){
        visible=(status==='current' && !isDone);
      }else if(activeFilter==='past'){
        visible=(status==='done' && !isDone);
      }else if(activeFilter==='upcoming'){
        visible=(status==='upcoming' && !isDone);
      }else if(activeFilter==='ultrasound'||activeFilter==='blood'||activeFilter==='vaccine'){
        visible=(category===activeFilter);
      }
      card.style.display=visible?'block':'none';
    });

    var empty=document.getElementById('prenatalEmptyFilter');if(!empty){empty=document.createElement('p');empty.id='prenatalEmptyFilter';empty.setAttribute('role','status');empty.style.padding='24px 0';document.getElementById('timeline').after(empty);}
    empty.hidden=Array.from(cards).some(c=>c.style.display!=='none');empty.textContent=activeFilter==='current'&&calculatedCurrentWeek===null?'예정일을 입력하면 현재 주차의 검사를 볼 수 있어요.':'이 조건에 해당하는 검사가 없어요.';
    var headers=document.querySelectorAll('#timeline .trimester-header');
    headers.forEach(function(hdr){
      var next=hdr.nextElementSibling;
      var hasVisible=false;
      while(next && !next.classList.contains('trimester-header')){
        if(next.classList.contains('test-card') && next.style.display!=='none'){
          hasVisible=true;
          break;
        }
        next=next.nextElementSibling;
      }
      hdr.style.display=hasVisible?'block':'none';
    });
  }

  function setupFilterButtons(){
    var container=document.getElementById('filterBtns');
    if(!container)return;
    if(!container.querySelector('[data-filter="past"]')){var past=document.createElement('button');past.type='button';past.className='quick-btn';past.dataset.filter='past';past.textContent='시기 지남';container.appendChild(past);}
    var buttons=container.querySelectorAll('button.quick-btn');
    buttons.forEach(function(oldBtn){
      var newBtn=oldBtn.cloneNode(true);
      oldBtn.parentNode.replaceChild(newBtn,oldBtn);
      newBtn.addEventListener('click',function(){
        container.querySelectorAll('button.quick-btn').forEach(function(b){ b.classList.remove('active'); });
        newBtn.classList.add('active');
        activeFilter=newBtn.getAttribute('data-filter')||'all';
        applyActiveFilter();
        announceLive(newBtn.textContent.trim()+' 필터가 적용되었습니다.');
      });
    });
  }

  window.updateTimeline=function(){
    injectStaticNavAndHeader();
    var input=document.getElementById('dueDate');
    var errEl=document.getElementById('dueDateError');
    var statusInfo=document.getElementById('statusInfo');
    var currentWeekEl=document.getElementById('currentWeek');
    var daysLeftEl=document.getElementById('daysLeft');
    var trimesterEl=document.getElementById('trimester');
    var progressFill=document.getElementById('progressFill');
    var timelineSub=document.getElementById('timelineSub');

    if(errEl){
      errEl.textContent='';
      errEl.style.display='none';
    }

    if(!input||!input.value||!input.value.trim()){
      try{ localStorage.removeItem(STORAGE_KEY_DATE); }catch{/* Storage may be unavailable; the current session still works. */}
      if(statusInfo) statusInfo.style.display='none';
      if(timelineSub) timelineSub.textContent='출산 예정일을 입력하면 주수별 권장 일정이 맞춤 정렬됩니다.';
      window.renderTimeline(null);
      return;
    }

    var val=input.value.trim();
    var parts=val.split('-');
    if(parts.length!==3){
      showInputError('올바른 날짜 형식(YYYY-MM-DD)으로 입력해 주세요.');
      return;
    }

    var year=parseInt(parts[0],10);
    var month=parseInt(parts[1],10);
    var day=parseInt(parts[2],10);
    if(isNaN(year)||isNaN(month)||isNaN(day)||month<1||month>12||day<1||day>31){
      showInputError('유효한 날짜를 입력해 주세요.');
      return;
    }

    var checkDate=new Date(year,month-1,day);
    if(checkDate.getFullYear()!==year||checkDate.getMonth()!==(month-1)||checkDate.getDate()!==day){
      showInputError('달력에 존재하는 날짜를 입력해 주세요.');
      return;
    }

    var now=new Date();
    var todaySerial=getUtcDateSerial(now.getFullYear(),now.getMonth(),now.getDate());
    var dueSerial=getUtcDateSerial(year,month-1,day);
    var diffDays=dueSerial-todaySerial;

    if(diffDays>300){
      showInputError('예정일은 오늘 기준 300일 이내로 설정해 주세요.');
      return;
    }
    if(diffDays<-60){
      showInputError('오늘부터 60일보다 오래 지난 예정일은 입력할 수 없어요.');
      return;
    }

    try{ localStorage.setItem(STORAGE_KEY_DATE,val); }catch{/* Storage may be unavailable; the current session still works. */}

    var elapsedDays=Math.max(0,280-diffDays);
    var currentWeek=Math.floor(elapsedDays/7);
    var displayWeek=Math.max(0,currentWeek);

    if(statusInfo) statusInfo.style.display='block';
    if(currentWeekEl){
      if(diffDays<0){
        currentWeekEl.textContent=displayWeek+'주차 (예정일 경과)';
      }else{
        currentWeekEl.textContent=displayWeek+'주 '+(elapsedDays%7)+'일';
      }
    }

    if(daysLeftEl){
      if(diffDays<0){
        daysLeftEl.textContent='D+'+Math.abs(diffDays);
      }else if(diffDays===0){
        daysLeftEl.textContent='D-Day';
      }else{
        daysLeftEl.textContent='D-'+diffDays;
      }
    }

    if(trimesterEl){
      if(displayWeek<=13) trimesterEl.textContent='1분기 (초기)';
      else if(displayWeek<=27) trimesterEl.textContent='2분기 (중기)';
      else trimesterEl.textContent='3분기 (후기)';
    }

    if(progressFill){
      var pct=Math.min(100,Math.max(0,Math.round((elapsedDays/280)*100)));
      progressFill.style.width=pct+'%';
    }

    if(timelineSub){
      if(diffDays<0){
        timelineSub.textContent='예정일 경과 · 담당 의료진과 일정을 확인하세요';
      }else{
        timelineSub.textContent='현재 임신 '+displayWeek+'주차 기준 권장 검사 일정입니다.';
      }
    }

    window.renderTimeline(displayWeek);
  };

  function showInputError(msg){
    var errEl=document.getElementById('dueDateError');
    var statusInfo=document.getElementById('statusInfo');
    if(errEl){
      errEl.textContent=msg;
      errEl.style.display='block';
    }
    if(statusInfo) statusInfo.style.display='none';
    document.getElementById('timelineSub').textContent='출산 예정일을 확인해 주세요.';
    window.renderTimeline(null);
    announceLive('입력 오류: '+msg);
  }

  injectStaticNavAndHeader();
  setupFilterButtons();

  try{
    var savedDate=localStorage.getItem(STORAGE_KEY_DATE);
    var dateInput=document.getElementById('dueDate');
    if(savedDate && dateInput && !dateInput.value){
      dateInput.value=savedDate;
    }
  }catch{/* Storage may be unavailable; the current session still works. */}

  window.updateTimeline();
})();