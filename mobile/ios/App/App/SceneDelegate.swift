import UIKit
import Capacitor
import WebKit
import HealthKit
import EventKit
import EventKitUI

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = UINavigationController(rootViewController: WorkspaceViewController())
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

final class WorkspaceViewController: UIViewController, WKNavigationDelegate, WKScriptMessageHandler, EKEventEditViewDelegate {
    private var web: WKWebView!
    private var origin: URL?
    private let localURL=URL(string:"hermes-app://bundle/")!
    private var http: WorkspaceHTTP?
    private let healthStore = HKHealthStore()
    private let eventStore = EKEventStore()
    private var nativeBusy = false
    private var documentGeneration = 0
    private var eventReply: (([String:Any])->Void)?
    private func text(_ en: String, _ zh: String) -> String {
        Locale.preferredLanguages.first?.hasPrefix("zh") == true ? zh : en
    }
    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Hermes"
        view.backgroundColor = .systemBackground
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.add(WeakDeviceHandler(self), name: "hermesDevice")
        configuration.userContentController.add(WeakDeviceHandler(self), name: "workspaceHTTP")
        configuration.setURLSchemeHandler(BundledAssets(), forURLScheme:"hermes-app")
        web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = self
        web.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(web)
        NSLayoutConstraint.activate([
            web.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            web.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            web.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
        navigationItem.rightBarButtonItem = UIBarButtonItem(image: UIImage(systemName: "server.rack"), style: .plain, target: self, action: #selector(chooseServer))
        navigationItem.rightBarButtonItem?.accessibilityLabel = text("Workspace server", "工作台服务器")
        if let saved = UserDefaults.standard.string(forKey: "workbenchOrigin"), let url = normalized(saved, rootOnly: true) {
            origin = url; http=WorkspaceHTTP(url)
        } else { DispatchQueue.main.async { self.chooseServer() } }
        web.load(URLRequest(url:localURL))
    }
    private func normalized(_ value: String, rootOnly: Bool) -> URL? {
        guard var parts = URLComponents(string: value.trimmingCharacters(in: .whitespacesAndNewlines)),
              parts.scheme?.lowercased() == "https", let host = parts.host, !host.isEmpty,
              parts.user == nil, parts.password == nil else { return nil }
        if rootOnly && (!(parts.path.isEmpty || parts.path == "/") || parts.query != nil || parts.fragment != nil) { return nil }
        parts.scheme = "https"; parts.host = host.lowercased(); parts.path = ""; parts.query = nil; parts.fragment = nil
        if parts.port == 443 { parts.port = nil }
        return parts.url
    }
    @objc private func chooseServer() {
        let alert = UIAlertController(title: text("Workspace server", "工作台服务器"), message: nil, preferredStyle: .alert)
        alert.addTextField { field in
            field.placeholder = "https://"; field.text = self.origin?.absoluteString
            field.keyboardType = .URL; field.autocapitalizationType = .none; field.autocorrectionType = .no
        }
        alert.addAction(UIAlertAction(title: text("Cancel", "取消"), style: .cancel))
        alert.addAction(UIAlertAction(title: text("Connect", "连接"), style: .default) { _ in
            guard let url = self.normalized(alert.textFields?.first?.text ?? "", rootOnly: true) else {
                self.showError(self.text("Enter an HTTPS server origin.", "请输入 HTTPS 服务器根地址。")); return
            }
            let confirm = UIAlertController(title: url.absoluteString, message: self.text("Switch server? Unsent content will be lost.", "切换服务器？未发送内容将丢失。"), preferredStyle: .alert)
            confirm.addAction(UIAlertAction(title: self.text("Cancel", "取消"), style: .cancel))
            confirm.addAction(UIAlertAction(title: self.text("Connect", "连接"), style: .default) { _ in
                self.web.stopLoading(); self.documentGeneration += 1; self.origin = url
                self.http?.close();self.http=WorkspaceHTTP(url)
                UserDefaults.standard.set(url.absoluteString, forKey: "workbenchOrigin")
                self.web.load(URLRequest(url: self.localURL))
            })
            self.present(confirm, animated: true)
        })
        present(alert, animated: true)
    }
    private func showError(_ message: String) {
        let alert = UIAlertController(title: text("Connection", "连接"), message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default)); present(alert, animated: true)
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if navigationAction.targetFrame?.isMainFrame == false { decisionHandler(.allow); return }
        if isLocal(url) { decisionHandler(.allow); return }
        decisionHandler(.cancel)
        guard url.scheme == "https" else { return }
        let alert = UIAlertController(title: text("Open external link?", "打开外部链接？"), message: url.host, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: text("Cancel", "取消"), style: .cancel))
        alert.addAction(UIAlertAction(title: text("Open", "打开"), style: .default) { _ in UIApplication.shared.open(url) })
        present(alert, animated: true)
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code != NSURLErrorCancelled { showError(text("Connection failed. Check your server address.", "连接失败，请检查服务器地址。")) }
    }
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { documentGeneration += 1 }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "workspaceHTTP" {
            guard message.frameInfo.isMainFrame,let frame=message.frameInfo.request.url,isLocal(frame),
                  let request=message.body as? [String:Any],let id=request["id"] as? String,id.range(of:"^[a-zA-Z0-9-]{1,64}$",options:.regularExpression) != nil else{return}
            let generation=documentGeneration
            let reply:([String:Any])->Void={result in DispatchQueue.main.async{
                guard generation==self.documentGeneration,let current=self.web.url,self.isLocal(current) else{return}
                var value=result;value["id"]=id
                guard let data=try? JSONSerialization.data(withJSONObject:value),let json=String(data:data,encoding:.utf8) else{return}
                self.web.evaluateJavaScript("window.dispatchEvent(new CustomEvent('hermes-http-result',{detail:"+json+"}));",completionHandler:nil)
            }}
            if let http=http{http.request(request,reply)}else{reply(["error":"SERVER_NOT_CONFIGURED"])}
            return
        }
        guard !nativeBusy, message.frameInfo.isMainFrame,
              let frameURL = message.frameInfo.request.url, isLocal(frameURL),
              let request = message.body as? [String: Any], let id = request["id"] as? String, id.count <= 64,
              id.range(of: "^[a-zA-Z0-9-]+$", options: .regularExpression) != nil,
              let method = request["method"] as? String, ["health.read", "calendar.read", "calendar.compose"].contains(method), let requestedOrigin = origin else { return }
        let keys = Array(Set(request["metrics"] as? [String] ?? [])).filter { healthTypes[$0] != nil || $0 == "sleep" }.sorted()
        if method == "health.read" && keys.isEmpty { return }
        nativeBusy = true
        let generation = documentGeneration
        let reply: ([String: Any]) -> Void = { result in DispatchQueue.main.async {
            self.nativeBusy = false
            guard generation == self.documentGeneration, self.origin == requestedOrigin,
                  let current = self.web.url, self.isLocal(current) else { return }
            var value = result; value["id"] = id
            guard let data = try? JSONSerialization.data(withJSONObject: value), let json = String(data: data, encoding: .utf8) else { return }
            self.web.evaluateJavaScript("window.dispatchEvent(new CustomEvent('hermes-native-result',{detail:" + json + "}));", completionHandler: nil)
        } }
        if method == "calendar.compose" { composeCalendar(request["event"] as? [String:Any], reply); return }
        let scope = method == "health.read" ? text("Today's steps / latest values in 7 days: ", "今日步数／近七天最新指标：") + keys.joined(separator: ", ") : text("Calendar titles and times for the next 7 days (up to 100)", "未来七天的日历标题和时间（最多100条）")
        let alert = UIAlertController(title: text("Read device data?", "读取设备数据？"), message: requestedOrigin.absoluteString + "\n" + scope + "\n" + text("Only the built-in interface receives this read. Sending to Hermes requires separate confirmation.", "本次数据仅交给内置界面。发送给 Hermes 需要另行确认。"), preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: text("Cancel", "取消"), style: .cancel) { _ in reply(["error":"CANCELLED"]) })
        alert.addAction(UIAlertAction(title: text("Allow", "允许"), style: .default) { _ in
            guard generation == self.documentGeneration else { reply(["error":"CANCELLED"]); return }
            if method == "health.read" { self.readHealth(keys, reply) } else { self.readCalendar(reply) }
        })
        present(alert, animated: true)
    }
    private let healthTypes: [String: HKQuantityTypeIdentifier] = ["steps":.stepCount,"weight":.bodyMass,"restingHeartRate":.restingHeartRate,"bodyFat":.bodyFatPercentage,"oxygen":.oxygenSaturation,"bloodGlucose":.bloodGlucose]
    private func isLocal(_ url:URL)->Bool{url.scheme=="hermes-app" && url.host=="bundle" && url.user==nil && url.password==nil}
    private func readHealth(_ keys: [String], _ reply: @escaping ([String:Any])->Void) {
        guard HKHealthStore.isHealthDataAvailable() else { reply(["error":"HEALTH_UNAVAILABLE"]); return }
        let types:[HKObjectType] = keys.compactMap { key in
            if key == "sleep" { return HKCategoryType.categoryType(forIdentifier:.sleepAnalysis) }
            return healthTypes[key].flatMap { HKQuantityType.quantityType(forIdentifier:$0) }
        }
        healthStore.requestAuthorization(toShare:[], read:Set(types)) { ok, error in
            guard ok, error == nil else { reply(["error":"READ_FAILED"]); return }
            let end=Date(), start=Date().addingTimeInterval(-7*86400), group=DispatchGroup(), lock=NSLock()
            var metrics=[[String:Any]]()
            for key in keys {
                if key == "sleep" {
                    group.enter();self.readSleep(end) { item in lock.lock();metrics.append(item);lock.unlock();group.leave() };continue
                }
                guard let identifier=self.healthTypes[key], let type=HKQuantityType.quantityType(forIdentifier:identifier) else { continue }
                group.enter()
                let units: [String:String] = ["steps":"count","weight":"kg","restingHeartRate":"count/min","bodyFat":"%","oxygen":"%","bloodGlucose":"mmol/L"]
                let unit = key == "bloodGlucose" ? HKUnit.moleUnit(with:.milli, molarMass:HKUnitMolarMassBloodGlucose).unitDivided(by:.liter()) : HKUnit(from:units[key]!)
                let complete: (HKQuantity?,Date?,Error?)->Void = { quantity, at, error in
                    var value:Any = quantity.map { $0.doubleValue(for:unit) as Any } ?? NSNull()
                    if let number=value as? Double, key == "bodyFat" || key == "oxygen" { value=number*100 }
                    let item:[String:Any] = ["key":key,"value":value,"unit":units[key]!,"at":at.map { ISO8601DateFormatter().string(from:$0) } as Any? ?? NSNull(),"status":error != nil ? "read_failed" : quantity == nil ? "no_data" : "available"]
                    lock.lock();metrics.append(item);lock.unlock();group.leave()
                }
                if key == "steps" {
                    let predicate=HKQuery.predicateForSamples(withStart:Calendar.current.startOfDay(for:end),end:end,options:.strictStartDate)
                    self.healthStore.execute(HKStatisticsQuery(quantityType:type,quantitySamplePredicate:predicate,options:.cumulativeSum) { _,result,error in complete(result?.sumQuantity(),end,error) })
                } else {
                    let predicate=HKQuery.predicateForSamples(withStart:start,end:end,options:.strictStartDate)
                    self.healthStore.execute(HKSampleQuery(sampleType:type,predicate:predicate,limit:1,sortDescriptors:[NSSortDescriptor(key:HKSampleSortIdentifierEndDate,ascending:false)]) { _,samples,error in
                        let sample=samples?.first as? HKQuantitySample;complete(sample?.quantity,sample?.endDate,error)
                    })
                }
            }
            group.notify(queue:.main) { reply(["source":"HealthKit","metrics":metrics,"from":ISO8601DateFormatter().string(from:start),"to":ISO8601DateFormatter().string(from:end)]) }
        }
    }
    private func readSleep(_ end:Date,_ reply:@escaping ([String:Any])->Void){
        let start=end.addingTimeInterval(-86400)
        guard let type=HKCategoryType.categoryType(forIdentifier:.sleepAnalysis) else{reply(["key":"sleep","status":"read_failed"]);return}
        let predicate=HKQuery.predicateForSamples(withStart:start,end:end,options:[])
        healthStore.execute(HKSampleQuery(sampleType:type,predicate:predicate,limit:1000,sortDescriptors:nil){_,samples,error in
            guard error == nil,(samples?.count ?? 0)<1000 else{reply(["key":"sleep","status":"read_failed"]);return}
            let intervals=(samples as? [HKCategorySample] ?? []).filter{[1,3,4,5].contains($0.value)}.map{(max($0.startDate,start),min($0.endDate,end))}.filter{$0.1 > $0.0}.sorted{$0.0 < $1.0}
            var total:TimeInterval=0
            if let first=intervals.first{
                var left=first.0,right=first.1
                for (a,b) in intervals.dropFirst(){if a<=right{right=max(right,b)}else{total+=right.timeIntervalSince(left);left=a;right=b}}
                total+=right.timeIntervalSince(left)
            }
            reply(["key":"sleep","value":intervals.isEmpty ? NSNull() : total/60 as Any,"unit":"min","status":intervals.isEmpty ? "no_data" : "available","at":ISO8601DateFormatter().string(from:end),"from":ISO8601DateFormatter().string(from:start),"aggregation":"union_of_asleep_stages"])
        })
    }
    private func readSteps(_ reply: @escaping ([String: Any]) -> Void) {
        guard HKHealthStore.isHealthDataAvailable(), let type = HKQuantityType.quantityType(forIdentifier: .stepCount) else { reply(["error":"HEALTH_UNAVAILABLE"]); return }
        healthStore.requestAuthorization(toShare: [], read: [type]) { success, error in
            guard success, error == nil else { reply(["error":"READ_FAILED"]); return }
            let end = Date(), start = Calendar.current.startOfDay(for: Date())
            let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
            let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, result, error in
                guard error == nil else { reply(["error":"READ_FAILED"]); return }
                let steps: Any = result?.sumQuantity().map { $0.doubleValue(for: .count()) as Any } ?? NSNull()
                reply(["source":"HealthKit", "steps":steps, "from":ISO8601DateFormatter().string(from:start), "to":ISO8601DateFormatter().string(from:end)])
            }
            self.healthStore.execute(query)
        }
    }
    private func readCalendar(_ reply: @escaping ([String: Any]) -> Void) {
        let read: (Bool, Error?) -> Void = { allowed, error in
            guard allowed, error == nil else { reply(["error":"PERMISSION_DENIED"]); return }
            DispatchQueue.global(qos: .userInitiated).async {
                let start = Date(), end = Date().addingTimeInterval(7 * 86400)
                let predicate = self.eventStore.predicateForEvents(withStart:start, end:end, calendars:nil)
                let events: [[String:Any]] = self.eventStore.events(matching:predicate).sorted { $0.startDate < $1.startDate }.prefix(100).map {
                    ["title":$0.title ?? "", "start":$0.startDate.timeIntervalSince1970 * 1000, "end":$0.endDate.timeIntervalSince1970 * 1000, "allDay":$0.isAllDay]
                }
                reply(["source":"EventKit", "events":events, "limit":100, "from":start.timeIntervalSince1970 * 1000, "to":end.timeIntervalSince1970 * 1000])
            }
        }
        if #available(iOS 17.0, *) { eventStore.requestFullAccessToEvents(completion:read) }
        else { eventStore.requestAccess(to:.event, completion:read) }
    }
    private func composeCalendar(_ data:[String:Any]?,_ reply:@escaping ([String:Any])->Void){
        guard let data=data,let title=data["title"] as? String,!title.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,title.count<=300,
              let start=data["start"] as? Double,let end=data["end"] as? Double,start.isFinite,end.isFinite,
              start>=946684800000,end<=4102444800000,end-start>=300000,end-start<=86400000 else{reply(["error":"INVALID_INPUT"]);return}
        let generation=documentGeneration
        let open:(Bool,Error?)->Void={allowed,error in DispatchQueue.main.async{
            guard allowed,error == nil else{reply(["error":"PERMISSION_DENIED"]);return}
            guard generation==self.documentGeneration else{reply(["error":"CANCELLED"]);return}
            let event=EKEvent(eventStore:self.eventStore);event.title=title;event.startDate=Date(timeIntervalSince1970:start/1000);event.endDate=Date(timeIntervalSince1970:end/1000)
            let editor=EKEventEditViewController();editor.eventStore=self.eventStore;editor.event=event;editor.editViewDelegate=self
            self.eventReply=reply;editor.isModalInPresentation=true;self.present(editor,animated:true)
        }}
        if #available(iOS 17.0,*){eventStore.requestWriteOnlyAccessToEvents(completion:open)}else{eventStore.requestAccess(to:.event,completion:open)}
    }
    func eventEditViewController(_ controller:EKEventEditViewController,didCompleteWith action:EKEventEditViewAction){
        let callback=eventReply;eventReply=nil
        controller.dismiss(animated:true){callback?(["status":action == .saved ? "saved" : "cancelled"])}
    }
}

private final class BundledAssets:NSObject,WKURLSchemeHandler {
    func webView(_ webView:WKWebView,start urlSchemeTask:WKURLSchemeTask){
        guard let url=urlSchemeTask.request.url,url.host=="bundle" else{urlSchemeTask.didFailWithError(URLError(.badURL));return}
        let name=url.path=="/" ? "index.html" : String(url.path.dropFirst())
        guard !name.contains(".."),name.range(of:"^[A-Za-z0-9/_.-]+$",options:.regularExpression) != nil,
              let root=Bundle.main.resourceURL?.appendingPathComponent("public"),let data=try? Data(contentsOf:root.appendingPathComponent(name)) else{urlSchemeTask.didFailWithError(URLError(.fileDoesNotExist));return}
        let mime=name.hasSuffix(".js") ? "application/javascript" : name.hasSuffix(".css") ? "text/css" : name.hasSuffix(".jpg") ? "image/jpeg" : name.hasSuffix(".json") ? "application/json" : "text/html"
        urlSchemeTask.didReceive(URLResponse(url:url,mimeType:mime,expectedContentLength:data.count,textEncodingName:"utf-8"));urlSchemeTask.didReceive(data);urlSchemeTask.didFinish()
    }
    func webView(_ webView:WKWebView,stop urlSchemeTask:WKURLSchemeTask){}
}

private final class WorkspaceHTTP:NSObject,URLSessionDataDelegate {
    private let origin:URL
    private var session:URLSession!
    private let lock=NSLock()
    private struct Pending {var data=Data();var response:HTTPURLResponse?;let reply:([String:Any])->Void}
    private var pending=[Int:Pending]()
    init(_ origin:URL){self.origin=origin;super.init();let config=URLSessionConfiguration.ephemeral;config.timeoutIntervalForRequest=75;config.timeoutIntervalForResource=85;config.urlCache=nil;session=URLSession(configuration:config,delegate:self,delegateQueue:nil)}
    func close(){session.invalidateAndCancel()}
    func request(_ input:[String:Any],_ reply:@escaping ([String:Any])->Void){
        guard let path=input["path"] as? String,let parts=URLComponents(string:path),parts.scheme==nil,parts.host==nil,parts.fragment==nil,
              parts.percentEncodedPath.range(of:"^/api/[A-Za-z0-9/_-]+$",options:.regularExpression) != nil,
              let target=URL(string:path,relativeTo:origin)?.absoluteURL,
              let method=input["method"] as? String,["GET","POST","PATCH","DELETE","PUT"].contains(method),
              let body=input["body"] as? String,body.utf8.count<=524288 else{reply(["error":"INVALID_REQUEST"]);return}
        var request=URLRequest(url:target);request.httpMethod=method;request.setValue(origin.absoluteString,forHTTPHeaderField:"Origin")
        let headers=input["headers"] as? [String:String] ?? [:]
        for name in ["content-type","x-csrf-token","x-workspace-user","idempotency-key"]{if let value=headers[name]{guard value.count<=4096,!value.contains("\r"),!value.contains("\n") else{reply(["error":"INVALID_REQUEST"]);return};request.setValue(value,forHTTPHeaderField:name)}}
        if method != "GET" && !body.isEmpty{request.httpBody=body.data(using:.utf8)}
        lock.lock();guard pending.count<16 else{lock.unlock();reply(["error":"TOO_MANY_REQUESTS"]);return}
        let task=session.dataTask(with:request);pending[task.taskIdentifier]=Pending(reply:reply);lock.unlock();task.resume()
    }
    func urlSession(_ session:URLSession,task:URLSessionTask,willPerformHTTPRedirection response:HTTPURLResponse,newRequest request:URLRequest,completionHandler:@escaping(URLRequest?)->Void){completionHandler(nil)}
    func urlSession(_ session:URLSession,dataTask:URLSessionDataTask,didReceive response:URLResponse,completionHandler:@escaping(URLSession.ResponseDisposition)->Void){
        guard let response=response as? HTTPURLResponse,!(300..<400).contains(response.statusCode),response.expectedContentLength<=8*1024*1024 else{completionHandler(.cancel);return}
        lock.lock();pending[dataTask.taskIdentifier]?.response=response;lock.unlock();completionHandler(.allow)
    }
    func urlSession(_ session:URLSession,dataTask:URLSessionDataTask,didReceive data:Data){
        lock.lock();let size=(pending[dataTask.taskIdentifier]?.data.count ?? 0)+data.count
        if size<=8*1024*1024{pending[dataTask.taskIdentifier]?.data.append(data)};lock.unlock();if size>8*1024*1024{dataTask.cancel()}
    }
    func urlSession(_ session:URLSession,task:URLSessionTask,didCompleteWithError error:Error?){
        lock.lock();let item=pending.removeValue(forKey:task.taskIdentifier);lock.unlock();guard let item=item else{return}
        guard error==nil,let response=item.response else{item.reply(["error":"CONNECTION_FAILED"]);return}
        item.reply(["status":response.statusCode,"contentType":response.value(forHTTPHeaderField:"Content-Type") ?? "application/json","body":item.data.base64EncodedString()])
    }
}

private final class WeakDeviceHandler: NSObject, WKScriptMessageHandler {
    weak var target: WorkspaceViewController?
    init(_ target: WorkspaceViewController) { self.target = target }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive:message)
    }
}
