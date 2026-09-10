// Isolated component review: all API requests use fixtures; no application server or database is used.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const esbuild = require(process.env.UI_ESBUILD_PATH || path.resolve(root, '../Jaskids/node_modules/esbuild'));
const { chromium } = require(process.env.UI_PLAYWRIGHT_PATH || 'C:/Users/TFF_DEAD/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'jaskids-ui-review-'));
const branch = { id: 'b1', name: 'JAS KIDS Kilinochchi', is_active: true, address: 'Main Street', phone: '021 000 0000', jaskids_branch_id: null, _count: {staff: 2, bookings: 8, sales: 5, inventory: 6} };
const products = ['Chocolate muffin', 'Fresh orange juice', 'Chicken sandwich', 'Mineral water', 'Birthday candles', 'Party hat set'].map((name, i) => ({id: 'p'+i, name, buying_price: '150', selling_price: String(250+i*50), quantity: '20', category: {id: i < 4 ? 'c1':'c2', name: i < 4 ? 'Café':'Party supplies', is_active:true}}));
const booking = { id: 'booking1', reference_no:'JKB-20260905-1042', qr_hash:'TESTQR', booking_type:'ONLINE_PLAYHOUSE', branch_name:branch.name, parent_name:'Sample parent', parent_phone:'', baby_name:'', child_count:2, date:'2026-09-05', start_time:'10:00:00', end_time:'12:00:00', slot_name:'Play session', service_name:'Play Zone', total_price:2800, amount_paid:1400, amount_due:1400, payment_method:'cash', payment_status:'partial' };
const summary = {revenue:52400,product_revenue:24400,booking_revenue:28000,product_cost:12400,gross_profit:40000,wastage_loss:800,expenses:2200,net_operating:37000,supplier_paid:5000,supplier_outstanding:8000,transaction_count:24};
const financial = {branches:[branch],summary,expenses:[],wastage:[],sessions:[],supplier_balances:[{id:'s1',name:'Northern Foods',balance:8000}],payment_methods:{CASH:42400,CARD:10000},daily:[{date:'2026-09-05',product_sales:24400,booking_payments:28000,total:52400}],top_products:[{product_id:'p0',name:'Chocolate muffin',quantity:12,revenue:3000}]};
const sale = {id:'sale1',sale_no:'SALE-1042',status:'COMPLETED',total:'500',subtotal:'500',discount:'0',amount_received:'1000',change_given:'500',payment_method:'CASH',created_at:'2026-09-05T04:30:00Z',branch,cashier:{name:'Sample cashier'},cancelled_by_staff:null,cancellation_reason:null,items:[{id:'line1',product_name:'Chocolate muffin',quantity:'2',unit_price:'250',line_total:'500'}],transaction:{receipt:{receipt_no:'RCPT-1042'}}};
const fixture = url => {
  if(url.includes('/api/pos/sales/')) return {sale,can_cancel:true};
  if(url.includes('/api/pos/sales')) return {success:true,sale_id:'sale1',selected_branch:branch,branches:[branch],products,sales:[sale]};
  if(url.includes('/api/pos/scan')) return {success:true,booking};
  if(url.includes('/api/pos/checkin')) return {success:true,receipt_no:'RCPT-1042',amount_collected:1400,payment_status:'PAID',receipt:{branch_name:branch.name,served_by:'Sample cashier',issued_at:'2026-09-05T04:30:00Z',payment_method:'CASH'}};
  if(url.includes('/api/admin/branches')) return {branches:[branch]};
  if(url.includes('/api/admin/staff')) return {branches:[branch],staff:[{id:'staff1',name:'Sample cashier',email:'cashier@example.test',role:'CASHIER',is_active:true,branch}]};
  if(url.includes('/api/admin/stock')) return {can_manage:true,can_manage_catalogue:true,selected_branch_id:null,branches:[branch],categories:[products[0].category],products,inventory:products.map((product,i)=>({id:'i'+i,quantity:'20',branch,product})),movements:[]};
  if(url.includes('/api/admin/suppliers')) return {can_manage:true,can_manage_catalogue:true,selected_branch_id:null,branches:[branch],suppliers:[{id:'s1',name:'Northern Foods'}],purchases:[],payments:[],products};
  if(url.includes('/api/admin/accounts') || url.includes('/api/admin/reports')) return financial;
  if(url.includes('/api/pos/register')) return {branch,branches:[branch],current:null,sessions:[]};
  return {success:true};
};
const entry = `import React from 'react'; import {createRoot} from 'react-dom/client';
import './app/globals.css'; import adminStyles from './app/admin/admin.module.css';
import {ConfirmProvider} from './components/ui/ConfirmProvider'; import {AppHeader} from './components/layout/AppHeader';
import {SalesTerminal} from './components/pos/SalesTerminal'; import Scan from './app/pos/scan/page'; import Login from './app/login/page';
import {BranchManager} from './components/admin/BranchManager'; import {StaffTable} from './components/admin/StaffTable';
import {StockTable} from './components/admin/StockTable'; import {SupplierTable} from './components/admin/SupplierTable';
import {AccountsManager} from './components/admin/AccountsManager'; import {ReportsDashboard} from './components/admin/ReportsDashboard';
import {RegisterPanel} from './components/pos/RegisterPanel'; import {SalesHistory} from './components/pos/SalesHistory'; import {SaleDetail} from './components/pos/SaleDetail';
const screen = new URLSearchParams(location.search).get('screen') || 'sales';
const admins = {branches:[BranchManager,'Branches'],staff:[StaffTable,'Staff & access'],stock:[StockTable,'Products and stock'],suppliers:[SupplierTable,'Suppliers'],accounts:[AccountsManager,'Accounts'],reports:[ReportsDashboard,'Reports']};
const admin = admins[screen]; const Component = admin?.[0] || ({sales:SalesTerminal,scan:Scan,login:Login,register:RegisterPanel,history:SalesHistory,detail:SaleDetail})[screen];
createRoot(document.getElementById('root')).render(<ConfirmProvider><div className={admin?'admin-workspace':''}>{screen!=='login'&&<AppHeader name='Sample cashier' role={admin?'SUPER_ADMIN':'CASHIER'} branchName={admin?'All branches':'JAS KIDS Kilinochchi'} isAdmin={Boolean(admin)}/>}<div id='workspace-content' className='workspace-content' tabIndex={-1}>{admin?<main className={adminStyles.page}><div className={adminStyles.shell}><header className={adminStyles.header}><p>MANAGEMENT</p><h1>{admin[1]}</h1><span>Manage your branch operations.</span></header><Component/></div></main>:<Component saleId='sale1'/>}</div></div></ConfirmProvider>);`;
async function main() {
  const bundle = await esbuild.build({stdin:{contents:entry,resolveDir:root,sourcefile:'ui-review.tsx',loader:'tsx'},absWorkingDir:root,bundle:true,write:false,outdir:'review',jsx:'automatic',loader:{'.module.css':'local-css','.css':'css'},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'preview-next',setup(build){
    build.onResolve({filter:/^next\/(navigation|link|image)$/},args=>({path:args.path,namespace:'preview'}));
    build.onLoad({filter:/.*/,namespace:'preview'},args=>({loader:'jsx',resolveDir:root,contents:args.path.endsWith('navigation')?`export const usePathname=()=>location.pathname; export const useRouter=()=>({push:(p)=>window.__navigation=p,replace:(p)=>window.__navigation=p,refresh:()=>{}});`:`import React from 'react'; export default function Element({children,priority,...props}){return React.createElement('${args.path.endsWith('image')?'img':'a'}',props,children)}` }));
  }}]});
  const js = bundle.outputFiles.find(f=>f.path.endsWith('.js')).text;
  const css = bundle.outputFiles.find(f=>f.path.endsWith('.css')).text;
  const browser = await chromium.launch({channel:'msedge',headless:true});
  const errors=[];
  const page=await browser.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
    const url=route.request().url();
    if(url.includes('/api/')) return route.fulfill({contentType:'application/json',body:JSON.stringify(fixture(url))});
    if(url.endsWith('/bundle.js')) return route.fulfill({contentType:'text/javascript',body:js});
    if(url.endsWith('/bundle.css')) return route.fulfill({contentType:'text/css',body:css});
    if(url.endsWith('/Jaskids_Logo.png')) return route.fulfill({contentType:'image/png',body:fs.readFileSync(path.join(root,'public/Jaskids_Logo.png'))});
    return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/bundle.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>'});
  });
  const goto=async(screen)=>{await page.goto('http://localhost:43199/'+(Object.keys({branches:1,staff:1,stock:1,suppliers:1,accounts:1,reports:1}).includes(screen)?'admin/'+screen:'pos/'+screen)+'?screen='+screen);await page.waitForSelector('h1');await page.waitForTimeout(150);};
  for(const width of [1440,1024,768,375]) {
    await page.setViewportSize({width,height:900});
    for(const screen of ['sales','scan','branches','staff','stock','suppliers','accounts','reports','register','history','detail','login']) {
      await goto(screen);
      const dimensions=await page.evaluate(()=>({body:document.documentElement.scrollWidth,width:innerWidth}));
      assert(dimensions.body <= dimensions.width+1, screen+' overflows at '+width+': '+JSON.stringify(dimensions));
      if(screen === 'login') {
        const logo = page.getByAltText('JAS Kids Indoor Playhouse');
        await logo.evaluate(image => image.decode());
        const size = await logo.evaluate(image => ({width:image.getBoundingClientRect().width,height:image.getBoundingClientRect().height,ratio:image.naturalWidth/image.naturalHeight}));
        assert(Math.abs(size.width/size.height-size.ratio) < .02, 'Login logo proportions changed at '+width);
        assert(size.width >= 200, 'Login logo is too small at '+width);
      }
      if([1440,375].includes(width) && ['sales','scan','branches','accounts','login'].includes(screen)) await page.screenshot({path:path.join(output,screen+'-'+width+'.png'),fullPage:true});
    }
    console.log('Layout checks passed: '+width+'px');
  }
  await page.setViewportSize({width:375,height:812}); await goto('sales');
  await page.getByRole('button',{name:/Chocolate muffin/}).click();
  await page.getByRole('button',{name:'Review cart'}).click();
  assert(await page.getByRole('button',{name:/Complete sale/}).isVisible());
  await page.getByRole('button',{name:'Clear cart',exact:true}).click();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  assert(await page.getByRole('button',{name:/Complete sale/}).isEnabled());
  await page.screenshot({path:path.join(output,'cart-375.png'),fullPage:true});
  await page.getByRole('button',{name:/Complete sale/}).click();
  await page.waitForFunction(()=>window.__navigation==='/pos/sales/sale1');
  await goto('scan');
  await page.getByLabel('Booking QR value').fill('TESTQR'); await page.getByRole('button',{name:'Find booking'}).click();
  await page.getByRole('heading',{name:booking.reference_no}).waitFor();
  await page.screenshot({path:path.join(output,'booking-review-375.png'),fullPage:true});
  await page.getByRole('button',{name:/Collect .*check in/}).click();
  await page.getByRole('button',{name:'Print receipt'}).waitFor();
  await page.getByRole('button',{name:'Scan next booking'}).click();
  await page.getByRole('button',{name:'Start camera'}).waitFor();
  await page.getByRole('button',{name:'Log out',exact:true}).click();
  await page.getByRole('dialog').waitFor(); await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(),0);
  await page.getByRole('button',{name:'Log out',exact:true}).click();
  await page.screenshot({path:path.join(output,'logout-375.png')});
  await page.getByRole('dialog').getByRole('button',{name:'Log out',exact:true}).click();
  await page.waitForFunction(()=>window.__navigation==='/login');
  await goto('branches'); await page.getByText('Add branch',{exact:true}).click();
  await page.getByLabel('Branch name',{exact:true}).fill('Sample branch'); await page.getByRole('button',{name:'Create branch',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Branch created'}).waitFor();
  await goto('stock'); await page.getByRole('button',{name:'Catalogue',exact:true}).click(); await page.getByRole('heading',{name:'Product catalogue',exact:true}).waitFor();
  await page.setViewportSize({width:812,height:375}); await goto('sales');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.emulateMedia({reducedMotion:'reduce'}); await goto('scan');
  assert.equal(errors.length,0,'Browser errors: '+errors.join('; '));
  await browser.close(); console.log('Interaction checks passed. Screenshots: '+output);
}
main().catch(error=>{console.error(error);process.exit(1)});
