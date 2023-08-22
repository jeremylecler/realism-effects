﻿/* eslint-disable camelcase */
import { Color, Matrix3, ShaderMaterial, TangentSpaceNormalMap, Uniform, Vector2 } from "three"
import gbuffer_packing from "../../utils/shader/gbuffer_packing.glsl"
import { useBlueNoise } from "../../utils/BlueNoiseUtils"
export class GBufferMaterial extends ShaderMaterial {
	constructor() {
		super({
			type: "GBufferMaterial",

			defines: {
				USE_UV: "",
				TEMPORAL_RESOLVE: ""
			},

			uniforms: {
				color: new Uniform(new Color()),
				emissive: new Uniform(new Color()),
				map: new Uniform(null),
				roughnessMap: new Uniform(null),
				metalnessMap: new Uniform(null),
				emissiveMap: new Uniform(null),
				alphaMap: new Uniform(null),
				normalMap: new Uniform(null),
				normalScale: new Uniform(new Vector2(1, 1)),
				roughness: new Uniform(0),
				metalness: new Uniform(0),
				emissiveIntensity: new Uniform(0),
				uvTransform: new Uniform(new Matrix3()),
				boneTexture: new Uniform(null),
				blueNoiseTexture: new Uniform(null),
				blueNoiseRepeat: new Uniform(new Vector2(1, 1)),
				resolution: new Uniform(new Vector2(1, 1)),
				frame: new Uniform(0),
				cameraMoved: new Uniform(false),
				lightMap: new Uniform(null),
				lightMapIntensity: new Uniform(1),
				opacity: new Uniform(1)
			},

			vertexShader: /* glsl */ `
                varying vec2 vHighPrecisionZW;

                #define NORMAL
                #if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( TANGENTSPACE_NORMALMAP )
                    varying vec3 vViewPosition;
                #endif
                
                #include <common>
                #include <uv_pars_vertex>
                #include <displacementmap_pars_vertex>
                #include <normal_pars_vertex>
                #include <morphtarget_pars_vertex>
                #include <logdepthbuf_pars_vertex>
                #include <clipping_planes_pars_vertex>
                #include <skinning_pars_vertex>
                #include <color_pars_vertex>

                varying vec2 screenUv;

                void main() {
                    #include <uv_vertex>
                    
                    #include <skinbase_vertex>
                    #include <beginnormal_vertex>
                    #include <skinnormal_vertex>
                    #include <defaultnormal_vertex>

                    #include <morphnormal_vertex>
                    #include <normal_vertex>
                    #include <begin_vertex>
                    #include <morphtarget_vertex>

                    #include <skinning_vertex>

                    #include <displacementmap_vertex>
                    #include <project_vertex>
                    #include <logdepthbuf_vertex>
                    #include <clipping_planes_vertex>

                    #include <color_vertex>
                    
                    #if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( TANGENTSPACE_NORMALMAP )
                        vViewPosition = - mvPosition.xyz;
                    #endif

                    screenUv = gl_Position.xy * 0.5 + 0.5;

                    vHighPrecisionZW = gl_Position.zw;
                }
            `,

			fragmentShader: /* glsl */ `
                #define NORMAL
                #if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( TANGENTSPACE_NORMALMAP )
                    varying vec3 vViewPosition;
                #endif
                #include <packing>
                #include <uv_pars_fragment>
                #include <normal_pars_fragment>
                #include <bumpmap_pars_fragment>
                #include <normalmap_pars_fragment>
                #include <logdepthbuf_pars_fragment>
                #include <clipping_planes_pars_fragment>
                #include <color_pars_fragment>
                #include <alphamap_pars_fragment>
                #include <lightmap_pars_fragment>

                #include <map_pars_fragment>
                uniform vec3 color;

                varying vec2 vHighPrecisionZW;

                #include <metalnessmap_pars_fragment>
                uniform float metalness;

                #include <roughnessmap_pars_fragment>
                uniform float roughness;

                #include <emissivemap_pars_fragment>
                uniform vec3 emissive;
                uniform float emissiveIntensity;

                uniform float opacity;

                uniform vec2 resolution;
                uniform bool cameraMoved;

                varying vec2 screenUv;

                #include <gbuffer_packing>

                struct ReflectedLight {
                    vec3 indirectDiffuse;
                };

                void main() {
                    // !todo: properly implement alpha hashing
                    if(!cameraMoved){
                        float alpha = opacity;

                        #ifdef USE_ALPHAMAP
                            alpha *= texture2D( alphaMap, vUv ).g;
                        #elif defined(USE_MAP)
                            alpha *= texture2D( map, vUv ).a;
                        #endif

                        if(alpha < 1.){
                            float alphaThreshold = blueNoise().x;

                            if(alpha < alphaThreshold){
                                discard;
                                return;
                            }
                        }
                    }
               

                    //! todo: find better solution
                    //! todo: also fix texture repeat issue (not being repeated)
                    #define vMapUv vUv
                    #define vMetalnessMapUv vUv
                    #define vRoughnessMapUv vUv
                    #define vNormalMapUv vUv
                    #define vEmissiveMapUv vUv
                    #define vLightMapUv vUv
                    #define vEmissiveMapUv vUv

                    #include <clipping_planes_fragment>
                    #include <logdepthbuf_fragment>
                    #include <normal_fragment_begin>
                    #include <normal_fragment_maps>

                    float roughnessFactor = roughness;

                    #ifdef USE_ROUGHNESSMAP
                        vec4 texelRoughness = texture2D( roughnessMap, vUv );
                        // reads channel G, compatible with a combined OcclusionRoughnessMetallic (RGB) texture
                        roughnessFactor *= texelRoughness.g;
                    #endif

                    vec3 worldNormal = normalize((vec4(normal, 1.) * viewMatrix).xyz);

                    // if(isDeselected){
                    //     discard;
                    //     return;
                    // }

                    #include <metalnessmap_fragment>

                    vec4 diffuseColor = vec4(color, metalnessFactor);

                    #include <map_fragment>
                    #include <color_fragment>

                    vec3 totalEmissiveRadiance = vec3( emissive * emissiveIntensity );
                    #include <emissivemap_fragment>

                    ReflectedLight reflectedLight;

                    #include <lightmap_fragment>

                    #ifdef USE_LIGHTMAP
                        diffuseColor.rgb *= reflectedLight.indirectDiffuse;
                    #endif

                    // diffuseColor.a = alpha;

                    gl_FragColor = packGBuffer(diffuseColor, worldNormal, roughnessFactor, metalnessFactor, totalEmissiveRadiance);
                }
            `.replace("#include <gbuffer_packing>", gbuffer_packing),

			toneMapped: false,
			alphaTest: false,
			fog: false,
			lights: false
		})

		useBlueNoise(this)

		this.normalMapType = TangentSpaceNormalMap
		this.normalScale = new Vector2(1, 1)
	}
}
