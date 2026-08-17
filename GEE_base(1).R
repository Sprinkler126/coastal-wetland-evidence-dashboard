// =======================================================
  // 中国五大城市群湿地时间序列分析 (2000-2022) - 最终稳定版
// =======================================================
  
  // ========== 1. 配置区域 ==========
  
  // 🔴 1. 选择城市群: 'PRD', 'YRD', 'JJJ', 'HX', 'BBG'
var currentCluster = 'PRD'; 

// 🔴 2. 导出文件夹名称
var exportFolder = 'GEE_Wetland_Analysis_2025';

// 🔴 3. 时间范围
var startYear = 2000;
var endYear = 2022;

// ========== 2. 城市群定义 ==========
  
  var clusterConfigs = {
    'PRD': {
      name: '珠江三角洲',
      cities: ['Guangzhou', 'Shenzhen', 'Zhuhai', 'Foshan', 'Huizhou', 'Dongguan', 'Zhongshan', 'Jiangmen', 'Zhaoqing'],
      regions: ['Hong Kong', 'Macao'], provinces: []
    },
    'YRD': {
      name: '长江三角洲',
      cities: ['Nanjing', 'Wuxi', 'Changzhou', 'Suzhou', 'Nantong', 'Yancheng', 'Yangzhou', 'Zhenjiang', 'Taizhou', 
               'Hangzhou', 'Ningbo', 'Wenzhou', 'Jiaxing', 'Huzhou', 'Shaoxing', 'Jinhua', 'Zhoushan', 'Taizhou', 
               'Hefei', 'Wuhu', 'Ma\'anshan', 'Tongling', 'Anqing', 'Chuzhou', 'Chizhou', 'Xuancheng'],
      provinces: ['Shanghai'], regions: []
    },
    'JJJ': {
      name: '京津冀',
      cities: ['Shijiazhuang', 'Tangshan', 'Qinhuangdao', 'Handan', 'Xingtai', 'Baoding', 'Zhangjiakou', 'Chengde', 'Cangzhou', 'Langfang', 'Hengshui'],
      provinces: ['Beijing', 'Tianjin'], regions: []
    },
    'HX': {
      name: '海峡西岸',
      cities: ['Fuzhou', 'Xiamen', 'Zhangzhou', 'Quanzhou', 'Putian', 'Sanming', 'Nanping', 'Longyan', 'Ningde', 
               'Shantou', 'Chaozhou', 'Jieyang', 'Wenzhou'],
      provinces: [], regions: []
    },
    'BBG': {
      name: '北部湾',
      cities: ['Nanning', 'Beihai', 'Qinzhou', 'Fangchenggang', 'Yulin', 'Chongzuo', 
               'Zhanjiang', 'Maoming', 'Yangjiang', 'Haikou', 'Danzhou', 'Sanya'],
      provinces: [], regions: []
    }
  };

var config = clusterConfigs[currentCluster];
print('当前分析城市群:', config.name);

// --- 构建研究区几何 ---
  var studyAreaCollection = ee.FeatureCollection([]);
if (config.cities.length > 0) {
  studyAreaCollection = studyAreaCollection.merge(
    ee.FeatureCollection('FAO/GAUL/2015/level2').filter(ee.Filter.inList('ADM2_NAME', config.cities)).map(function(f){return f.set('NAME', f.get('ADM2_NAME'))})
  );
}
if (config.provinces.length > 0) {
  studyAreaCollection = studyAreaCollection.merge(
    ee.FeatureCollection('FAO/GAUL/2015/level1').filter(ee.Filter.inList('ADM1_NAME', config.provinces)).map(function(f){return f.set('NAME', f.get('ADM1_NAME'))})
  );
}
if (config.regions.length > 0) {
  studyAreaCollection = studyAreaCollection.merge(
    ee.FeatureCollection('FAO/GAUL/2015/level0').filter(ee.Filter.inList('ADM0_NAME', config.regions)).map(function(f){return f.set('NAME', f.get('ADM0_NAME'))})
  );
}

Map.centerObject(studyAreaCollection, 6);
Map.addLayer(studyAreaCollection.style({color:'red', fillColor:'00000000'}), {}, '边界');

// ========== 3. 核心计算逻辑 (已修复重复键报错) ==========
  
  var originalClasses = [180, 181, 182, 183, 184, 185, 186, 187];
var newClasses      = [1,   2,   3,   4,   5,   6,   7,   8];
var classNamesEN = ['Permanent_Water', 'Swamp', 'Marsh', 'Flooded_Flat', 'Saline', 'Mangrove', 'Salt_Marsh', 'Tidal_Flat'];

var years = [];
for (var i = startYear; i <= endYear; i++) {
  years.push(i);
}

// 客户端 map 循环构建任务
var yearlyStatsList = years.map(function(year) {
  
  var imagePath = "projects/sat-io/open-datasets/GWL_FCS30/GWL_FCS30_" + year;
  var img = ee.Image(imagePath).select('b1').clip(studyAreaCollection);
  
  // 1. 准备分类图层
  // 🔴 关键修复：添加 .selfMask()，移除值为0的背景像素，防止出现 class_code=0
  var classImg = img.remap(originalClasses, newClasses, 0).selfMask().rename('class');
  
  // 2. 准备面积图层
  var areaImg = ee.Image.pixelArea().divide(1e6).rename('area_sqkm');
  
  // 3. 组合：先面积，后分类
  var combined = areaImg.addBands(classImg);
  
  // 4. 执行分组统计
  var stats = combined.reduceRegions({
    collection: studyAreaCollection,
    reducer: ee.Reducer.sum().group({
      groupField: 1, // 指向 'class' band
      groupName: 'class_code',
    }),
    scale: 100 
  });
  
  // 5. 数据清洗
  return stats.map(function(feature) {
    var groups = ee.List(feature.get('groups'));
    var dict = ee.Dictionary({
      'Year': year,
      'City': feature.get('NAME'),
      'Cluster': config.name
    });
    
    
    // 遍历统计结果
    var classStats = groups.map(function(item) {
      item = ee.Dictionary(item);
      var code = ee.Number(item.get('class_code'));
      var area = ee.Number(item.get('sum'));
      
      // 因为使用了 selfMask，code 绝对不会是0，也不会出现索引 -1 的情况
      // code 1 (Permanent_Water) -> index 0
      var name = ee.List(classNamesEN).get(code.subtract(1)); 
      
      return ee.List([name, area]);
    }).flatten();
    
    // 合并字典
    return ee.Feature(null, dict.combine(ee.Dictionary.fromLists(
      classStats.slice(0, classStats.size(), 2), 
      classStats.slice(1, classStats.size(), 2)
    )));
    
  });
});

var wetlandStats = ee.FeatureCollection(yearlyStatsList).flatten();

// ========== 4. 可视化 ==========
  
  var palette = ['0066FF', '00CC66', 'FFFF00', 'FF9900', 'FF0000', '9933FF', 'FF00FF', '00FFFF'];
// 可视化时也加上 selfMask 以保持一致
var imgStart = ee.Image("projects/sat-io/open-datasets/GWL_FCS30/GWL_FCS30_" + startYear).remap(originalClasses, newClasses, 0).selfMask().clip(studyAreaCollection);
var imgEnd = ee.Image("projects/sat-io/open-datasets/GWL_FCS30/GWL_FCS30_" + endYear).remap(originalClasses, newClasses, 0).selfMask().clip(studyAreaCollection);

Map.addLayer(imgStart, {min:1, max:8, palette: palette}, startYear + ' 湿地');
Map.addLayer(imgEnd, {min:1, max:8, palette: palette}, endYear + ' 湿地');

var legend = ui.Panel({style: {position: 'bottom-left', padding: '8px'}});
legend.add(ui.Label('湿地类型', {fontWeight: 'bold'}));
var cnNames = ['永久水体', '沼泽', '泥沼', '洪泛平原', '盐碱地', '红树林', '盐沼', '潮滩'];
for(var i=0; i<8; i++){
  legend.add(ui.Panel({
    widgets: [
      ui.Label({style: {backgroundColor: '#' + palette[i], padding: '8px', margin: '0 5px 0 0'}}),
      ui.Label({value: cnNames[i], style: {fontSize: '12px'}})
    ],
    layout: ui.Panel.Layout.Flow('horizontal')
  }));
}
Map.add(legend);

// ========== 5. 导出设置 ==========
  
  var selectors = ['Year', 'Cluster', 'City', 'Permanent_Water', 'Swamp', 'Marsh', 'Flooded_Flat', 'Saline', 'Mangrove', 'Salt_Marsh', 'Tidal_Flat'];

Export.table.toDrive({
  collection: wetlandStats,
  description: 'Export_' + currentCluster,
  folder: exportFolder,
  fileNamePrefix: 'Wetland_' + currentCluster + '_2000-2022',
  fileFormat: 'CSV',
  selectors: selectors
});

print('✅ 最终修复完成。错误已解决。');
print('请在 Tasks 面板点击 RUN。');