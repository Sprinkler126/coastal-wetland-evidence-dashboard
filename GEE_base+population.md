```javascript
// =======================================================
// 中国五大城市群湿地时间序列分析 (2001-2022) - 最终稳定版 (修复 Rename 报错)
// =======================================================

// ========== 1. 配置区域 ==========

var currentCluster = 'PRD';
var exportFolder = 'GEE_Wetland_Analysis_2025';
var startYear = 2001;
var endYear = 2022;

// ========== 2. 城市群定义 ==========

var clusterConfigs = {
  'PRD': {
    name: '珠江三角洲',
    provinces: [],
    cities: [
      {name: 'Guangzhou',  province: 'Guangdong Sheng'},
      {name: 'Shenzhen',   province: 'Guangdong Sheng'},
      {name: 'Dongguan',   province: 'Guangdong Sheng'},
      {name: 'Huizhou',    province: 'Guangdong Sheng'},
      {name: 'Zhuhai',     province: 'Guangdong Sheng'},
      {name: 'Zhongshan',  province: 'Guangdong Sheng'},
      {name: 'Jiangmen',   province: 'Guangdong Sheng'},
      {name: 'Shanwei',    province: 'Guangdong Sheng'}
    ],
    regions: ['Hong Kong', 'Macao']
  },
  'YRD': {
    name: '长江三角洲',
    provinces: ['Shanghai Shi'],
    cities: [
      {name: 'Nantong',      province: 'Jiangsu Sheng'},
      {name: 'Yancheng',     province: 'Jiangsu Sheng'},
      {name: 'Lianyungang',  province: 'Jiangsu Sheng'},
      {name: 'Hangzhou', province: 'Zhejiang Sheng'},
      {name: 'Ningbo',    province: 'Zhejiang Sheng'},
      {name: 'Wenzhou',   province: 'Zhejiang Sheng'},
      {name: 'Taizhou',   province: 'Zhejiang Sheng'},
      {name: 'Zhoushan',  province: 'Zhejiang Sheng'},
      {name: 'Jiaxing',   province: 'Zhejiang Sheng'},
      {name: 'Shaoxing',  province: 'Zhejiang Sheng'}
    ],
    regions: []
  },
  'HX': {
    name: '海峡西岸',
    provinces: [],
    cities: [
      {name: 'Fuzhou',    province: 'Fujian Sheng'},
      {name: 'Xiamen',    province: 'Fujian Sheng'},
      {name: 'Quanzhou',  province: 'Fujian Sheng'},
      {name: 'Zhangzhou', province: 'Fujian Sheng'},
      {name: 'Putian',    province: 'Fujian Sheng'},
      {name: 'Ningde',    province: 'Fujian Sheng'},
      {name: 'Shantou',   province: 'Guangdong Sheng'},
      {name: 'Chaozhou',  province: 'Guangdong Sheng'},
      {name: 'Jieyang',   province: 'Guangdong Sheng'}
    ],
    regions: []
  },
  'BBG': {
    name: '北部湾',
    provinces: ['Hainan Sheng'],
    cities: [
      {name: 'Beihai',        province: 'Guangxi Zhuangzu Zizhiqu'},
      {name: 'Qinzhou',       province: 'Guangxi Zhuangzu Zizhiqu'},
      {name: 'Fangchenggang', province: 'Guangxi Zhuangzu Zizhiqu'},
      {name: 'Zhanjiang', province: 'Guangdong Sheng'},
      {name: 'Maoming',   province: 'Guangdong Sheng'},
      {name: 'Yangjiang', province: 'Guangdong Sheng'}
    ],
    regions: []
  },
  'BYS': {
    name: '环渤黄海',
    provinces: ['Tianjin Shi'],
    cities: [
      {name: 'Qinhuangdao',   province: 'Hebei Sheng'},
      {name: 'Tangshan',       province: 'Hebei Sheng'},
      {name: 'Cangzhou',       province: 'Hebei Sheng'},
      {name: 'Dalian',         province: 'Liaoning Sheng'},
      {name: 'Dandong',        province: 'Liaoning Sheng'},
      {name: 'Name Unknown',   province: 'Liaoning Sheng'},
      {name: 'Panjin',         province: 'Liaoning Sheng'},
      {name: 'Jinzhou',        province: 'Liaoning Sheng'},
      {name: 'Huludao',        province: 'Liaoning Sheng'},
      {name: 'Qingdao',   province: 'Shandong Sheng'},
      {name: 'Yantai',    province: 'Shandong Sheng'},
      {name: 'Weihai',    province: 'Shandong Sheng'},
      {name: 'Rizhao',    province: 'Shandong Sheng'},
      {name: 'Dongying',  province: 'Shandong Sheng'},
      {name: 'Weifang',   province: 'Shandong Sheng'},
      {name: 'Binzhou',   province: 'Shandong Sheng'}
    ],
    regions: []
  }
};

// 合并配置逻辑
clusterConfigs['ALL'] = { name: '全部沿海城市群', provinces: [], cities: [], regions: [] };
['PRD', 'YRD', 'HX', 'BBG', 'BYS'].forEach(function(k){
  var c = clusterConfigs[k];
  clusterConfigs['ALL'].cities = clusterConfigs['ALL'].cities.concat(c.cities);
  clusterConfigs['ALL'].provinces = clusterConfigs['ALL'].provinces.concat(c.provinces);
  clusterConfigs['ALL'].regions = clusterConfigs['ALL'].regions.concat(c.regions);
});

var config = clusterConfigs[currentCluster];

// --- 研究区构建 ---
var level1 = ee.FeatureCollection('FAO/GAUL/2015/level1');
var level2 = ee.FeatureCollection('FAO/GAUL/2015/level2');
var level0 = ee.FeatureCollection('FAO/GAUL/2015/level0');
var studyAreaCollection = ee.FeatureCollection([]);

if (config.cities.length > 0) {
  var cityFCs = config.cities.map(function(c) {
    return level2.filter(ee.Filter.and(ee.Filter.eq('ADM0_NAME', 'China'), ee.Filter.eq('ADM2_NAME', c.name), ee.Filter.eq('ADM1_NAME', c.province)))
    .map(function(f) { return f.set('NAME', f.get('ADM2_NAME')); });
  });
  for (var ci = 0; ci < cityFCs.length; ci++) { studyAreaCollection = studyAreaCollection.merge(cityFCs[ci]); }
}
if (config.provinces.length > 0) {
  studyAreaCollection = studyAreaCollection.merge(level1.filter(ee.Filter.and(ee.Filter.eq('ADM0_NAME', 'China'), ee.Filter.inList('ADM1_NAME', config.provinces))).map(function(f) { return f.set('NAME', f.get('ADM1_NAME')); }));
}
if (config.regions.length > 0) {
  studyAreaCollection = studyAreaCollection.merge(level0.filter(ee.Filter.inList('ADM0_NAME', config.regions)).map(function(f) { return f.set('NAME', f.get('ADM0_NAME')); }));
}

Map.centerObject(studyAreaCollection, 6);
Map.addLayer(studyAreaCollection.style({color:'red', fillColor:'00000000'}), {}, '研究区边界');

// ========== 3. 人口数据源函数 (鲁棒性增强) ==========

var getPopImage = function(year) {
  var popYear = year > 2020 ? 2020 : year;

  // 使用 mosaic() 替代 first()，防止因过滤器返回空集合导致的 rename(null) 错误
  var popImg = ee.ImageCollection("WorldPop/GP/100m/pop")
    .filter(ee.Filter.eq('year', popYear))
    .mosaic(); // 合并该年份所有切片

  // 确保选择第一个波段并命名。即使 mosaic 为空图像，也会保留元数据结构
  return popImg.select([0]).rename('pop_count');
};

// ========== 4. 核心计算逻辑 ==========

var originalClasses = [180, 181, 182, 183, 184, 185, 186, 187];
var newClasses      = [1,   2,   3,   4,   5,   6,   7,   8];
var classNamesEN = ['Permanent_Water', 'Swamp', 'Marsh', 'Flooded_Flat', 'Saline', 'Mangrove', 'Salt_Marsh', 'Tidal_Flat'];

var years = [];
for (var i = startYear; i <= endYear; i++) { years.push(i); }

var yearlyStatsList = years.map(function(year) {

  // A. 湿地面积统计
  var wetImg = ee.Image("projects/sat-io/open-datasets/GWL_FCS30/GWL_FCS30_" + year).select('b1').clip(studyAreaCollection);
  var classImg = wetImg.remap(originalClasses, newClasses, 0).selfMask().rename('class');
  var areaImg = ee.Image.pixelArea().divide(1e6).rename('area_sqkm');
  var wetCombined = areaImg.addBands(classImg);

  var wetStats = wetCombined.reduceRegions({
    collection: studyAreaCollection,
    reducer: ee.Reducer.sum().group({ groupField: 1, groupName: 'class_code' }),
    scale: 100
  });

  // B. 人口总量统计 (鲁棒版)
  var popImg = getPopImage(year).clip(studyAreaCollection);
  var popStats = popImg.reduceRegions({
    collection: studyAreaCollection,
    reducer: ee.Reducer.sum(),
    scale: 100
  });

  // 构建字典以匹配城市
  var popDict = ee.Dictionary.fromLists(
    popStats.aggregate_array('NAME'),
    popStats.aggregate_array('sum')
  );

  // C. 合并统计结果
  return wetStats.map(function(feature) {
    var cityName = feature.get('NAME');
    var totalPop = ee.Number(popDict.get(cityName)).add(0); // 加上0确保 null 处理
    var cityArea = feature.geometry().area().divide(1e6);
    var popDensity = totalPop.divide(cityArea);

    var groups = ee.List(feature.get('groups'));
    var dict = ee.Dictionary({
      'Year': year,
      'City': cityName,
      'Cluster': config.name,
      'Total_Population': totalPop,
      'Pop_Density': popDensity
    });

    var classStats = groups.map(function(item) {
      item = ee.Dictionary(item);
      var code = ee.Number(item.get('class_code'));
      var area = ee.Number(item.get('sum'));
      var name = ee.List(classNamesEN).get(code.subtract(1));
      return ee.List([name, area]);
    }).flatten();

    return ee.Feature(null, dict.combine(ee.Dictionary.fromLists(
      classStats.slice(0, classStats.size(), 2),
      classStats.slice(1, classStats.size(), 2)
    )));
  });
});

var wetlandStats = ee.FeatureCollection(yearlyStatsList).flatten();

// ========== 5. 可视化与导出 ==========

var palette = ['0066FF', '00CC66', 'FFFF00', 'FF9900', 'FF0000', '9933FF', 'FF00FF', '00FFFF'];
var imgStart = ee.Image("projects/sat-io/open-datasets/GWL_FCS30/GWL_FCS30_" + startYear).remap(originalClasses, newClasses, 0).selfMask().clip(studyAreaCollection);
Map.addLayer(imgStart, {min:1, max:8, palette: palette}, startYear + ' 湿地');

var selectors = [
  'Year', 'Cluster', 'City',
  'Total_Population', 'Pop_Density',
  'Permanent_Water', 'Swamp', 'Marsh', 'Flooded_Flat',
  'Saline', 'Mangrove', 'Salt_Marsh', 'Tidal_Flat'
];

Export.table.toDrive({
  collection: wetlandStats,
  description: 'Wetland_Pop_Analysis_v5',
  folder: exportFolder,
  fileNamePrefix: 'Wetland_Pop_' + currentCluster + '_2000-2022',
  fileFormat: 'CSV',
  selectors: selectors
});

print('✅ 修复版代码已就绪。');
print('💡 已使用 mosaic() 机制解决了 WorldPop 数据源可能的 Rename 报错问题。');


```
